"""Broader Indian market indexes for the SIF dashboard.

Catalog + live quotes: nsepython (NSE).
Historical OHLCV: Groww charting API (niftyindices history via nsepython is
currently unreliable behind many corporate networks).
"""

from __future__ import annotations

import logging
import re
import time
from datetime import date, datetime, timezone
from typing import Any

import requests

log = logging.getLogger(__name__)

# Frozen product set — do not expand without an explicit product decision.
MARKET_INDEXES: tuple[tuple[str, str], ...] = (
    ("NIFTY 50", "Nifty 50"),
    ("NIFTY 100", "Nifty 100"),
    ("NIFTY 500", "Nifty 500"),
    ("NIFTY MIDCAP 150", "Nifty Midcap 150"),
    ("NIFTY SMLCAP 250", "Nifty Smallcap 250"),
)

MARKET_INDEX_SYMBOLS: frozenset[str] = frozenset(symbol for symbol, _ in MARKET_INDEXES)

# Groww CASH chart identifiers for historical daily closes.
_GROWW_SYMBOL: dict[str, str] = {
    "NIFTY 50": "NIFTY",
    "NIFTY 100": "NIFTY100",
    "NIFTY 500": "NIFTY500",
    "NIFTY MIDCAP 150": "NIFTYMIDCAP150",
    "NIFTY SMLCAP 250": "NIFTYSMALLCAP250",
}

_NUM_RE = re.compile(r"[^\d.\-]")
_GROWW_SESSION: requests.Session | None = None


def _parse_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text == "-":
        return None
    cleaned = _NUM_RE.sub("", text)
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def list_market_indexes() -> list[dict[str, str]]:
    """Return the fixed index catalog."""
    return [{"symbol": symbol, "label": label} for symbol, label in MARKET_INDEXES]


def _label_for(symbol: str) -> str:
    for sym, label in MARKET_INDEXES:
        if sym == symbol:
            return label
    return symbol


def get_index_quote(symbol: str) -> dict[str, Any]:
    """Live quote for one catalog index (nsepython / NSE)."""
    if symbol not in MARKET_INDEX_SYMBOLS:
        raise ValueError(f"Unsupported market index: {symbol}")

    from nsepython import nse_get_index_quote

    raw = nse_get_index_quote(symbol) or {}
    return {
        "symbol": symbol,
        "label": _label_for(symbol),
        "last": _parse_number(raw.get("last")),
        "open": _parse_number(raw.get("open")),
        "high": _parse_number(raw.get("high")),
        "low": _parse_number(raw.get("low")),
        "previousClose": _parse_number(raw.get("previousClose")),
        "changePct": _parse_number(raw.get("percChange")),
        "asOf": raw.get("timeVal"),
    }


def get_all_index_quotes() -> list[dict[str, Any]]:
    """Live quotes for every catalog index (best-effort per symbol)."""
    out: list[dict[str, Any]] = []
    for symbol, _label in MARKET_INDEXES:
        try:
            out.append(get_index_quote(symbol))
        except Exception as exc:  # noqa: BLE001
            log.warning("Failed to fetch quote for %s: %s", symbol, exc)
            out.append(
                {
                    "symbol": symbol,
                    "label": _label_for(symbol),
                    "last": None,
                    "error": str(exc),
                }
            )
    return out


def _parse_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%d-%B-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    # ISO-ish fallback
    return date.fromisoformat(text[:10])


def _groww_session() -> requests.Session:
    global _GROWW_SESSION
    if _GROWW_SESSION is None:
        session = requests.Session()
        session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/122.0.0.0 Safari/537.36"
                ),
                "Accept": "application/json",
                "Origin": "https://groww.in",
                "Referer": "https://groww.in/",
            }
        )
        _GROWW_SESSION = session
    return _GROWW_SESSION


def get_index_history(
    symbol: str,
    start: date | datetime | str,
    end: date | datetime | str | None = None,
) -> list[dict[str, Any]]:
    """Daily closes from start date through end (default: today).

    Returns [{ date: YYYY-MM-DD, close: float }, ...] ascending.
    """
    if symbol not in MARKET_INDEX_SYMBOLS:
        raise ValueError(f"Unsupported market index: {symbol}")

    groww_sym = _GROWW_SYMBOL.get(symbol)
    if not groww_sym:
        raise RuntimeError(f"No history provider mapped for {symbol}")

    start_d = _parse_date(start)
    end_d = _parse_date(end) if end is not None else date.today()
    if end_d < start_d:
        start_d, end_d = end_d, start_d

    start_ms = int(
        datetime(start_d.year, start_d.month, start_d.day, tzinfo=timezone.utc).timestamp()
        * 1000
    )
    # Groww end is exclusive-ish; pad one day past end.
    end_ms = int(
        datetime(end_d.year, end_d.month, end_d.day, tzinfo=timezone.utc).timestamp() * 1000
    ) + 24 * 60 * 60 * 1000

    url = (
        "https://groww.in/v1/api/charting_service/v2/chart/exchange/NSE/segment/CASH/"
        f"{groww_sym}?endTimeInMillis={end_ms}&intervalInMinutes=1440"
        f"&startTimeInMillis={start_ms}"
    )

    try:
        response = _groww_session().get(url, timeout=30)
        response.raise_for_status()
        payload = response.json() or {}
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            f"Index history unavailable for {symbol} ({start_d} → {end_d}): {exc}"
        ) from exc

    candles = payload.get("candles") or []
    points: list[dict[str, Any]] = []
    for candle in candles:
        if not isinstance(candle, (list, tuple)) or len(candle) < 5:
            continue
        try:
            ts = int(candle[0])
            close = float(candle[4])
        except (TypeError, ValueError):
            continue
        # Groww timestamps are epoch seconds (not ms).
        day = datetime.fromtimestamp(ts, timezone.utc).date()
        if day < start_d or day > end_d:
            continue
        points.append({"date": day.isoformat(), "close": close})

    points.sort(key=lambda p: p["date"])
    return points


def get_indexes_history(
    symbols: list[str],
    start: date | datetime | str,
    end: date | datetime | str | None = None,
) -> list[dict[str, Any]]:
    """Fetch history for multiple catalog symbols (best-effort)."""
    out: list[dict[str, Any]] = []
    for symbol in symbols:
        if symbol not in MARKET_INDEX_SYMBOLS:
            out.append(
                {
                    "symbol": symbol,
                    "label": symbol,
                    "points": [],
                    "error": f"Unsupported market index: {symbol}",
                }
            )
            continue
        try:
            points = get_index_history(symbol, start, end)
            out.append(
                {
                    "symbol": symbol,
                    "label": _label_for(symbol),
                    "points": points,
                }
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("History failed for %s: %s", symbol, exc)
            out.append(
                {
                    "symbol": symbol,
                    "label": _label_for(symbol),
                    "points": [],
                    "error": str(exc),
                }
            )
        # Brief pause to be polite to the upstream charting service.
        time.sleep(0.05)
    return out
