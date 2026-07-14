"""FastAPI backend for the SIF Research Dashboard.

Loads data/funds.json once at startup, merges structured fund data from Neo4j
when available, and serves read-only views over the combined in-memory copy.

NAV history is the one live data path: /api/funds/{id}/nav-history queries an
in-memory DuckDB wired to NAV parquet in Azure Blob (see config/nav_history.py
and config/duckdb_session.py).
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

import search
from config.internal_auth import (
    INTERNAL_API_KEY,
    INTERNAL_PASSWORD,
    internal_auth_enabled,
    verify_internal_access,
)
from config.market_indexes import (
    get_all_index_quotes,
    get_index_history,
    get_index_quote,
    get_indexes_history,
    list_market_indexes,
)
from config.nav_history import PERIODS, nav_history_for_fund
from config.neo4j_session import init_driver
from data.merge import build_merged_data
from reports.portfolio_pdf import (
    PortfolioReportPdf,
    portfolio_pdf_filename,
    resolve_peer_tables,
)
from schemas.internal import InternalLoginRequest
from schemas.portfolio import PortfolioExportRequest

# Periods shown in the fund-detail returns table, in display order.
RETURN_PERIODS: list[str] = ["1M", "3M", "6M", "1Y"]

# Minimum history span (days) required to report each period's return. A fund
# younger than the window snaps its "start" to its earliest NAV, which would
# overstate (e.g.) a 1Y return for a 1-month-old fund — so we show "-" instead.
_RETURN_MIN_DAYS: dict[str, int] = {
    "1M": 25,
    "3M": 80,
    "6M": 170,
    "1Y": 350,
}

# data/funds.json lives one level up from backend/.
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "funds.json"

with DATA_PATH.open("r", encoding="utf-8") as fh:
    DATA: dict[str, Any] = json.load(fh)

_MERGED = build_merged_data(DATA, init_driver())
CATEGORIES: list[dict[str, Any]] = _MERGED["categories"]
FUNDS_INDEX: list[dict[str, Any]] = _MERGED["fundsIndex"]

# Precompute category lookup by id.
CATEGORY_BY_ID: dict[str, dict[str, Any]] = {c["id"]: c for c in CATEGORIES}
FUND_ID_BY_NAME: dict[str, str] = {
    f["name"]: search.resolve_fund_id(f) for f in FUNDS_INDEX
}

app = FastAPI(title="SIF Research Dashboard API", version="1.0.0")

# CORS: localhost defaults plus comma-separated CORS_ORIGINS (production web URL).
# Also allow any localhost port — Next.js often uses 3001/3002 when 3000 is busy.
_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_cors_origins.extend(
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "").split(",")
    if origin.strip()
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.post("/api/internal/login")
def internal_login(body: InternalLoginRequest) -> dict[str, bool | str]:
    """Exchange the team password for a bearer token used on internal APIs."""
    if not internal_auth_enabled():
        return {"ok": True, "token": "dev", "authDisabled": True}

    if body.password != INTERNAL_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password.")

    return {"ok": True, "token": INTERNAL_API_KEY}


@app.get("/api/funds")
def get_funds(_: None = Depends(verify_internal_access)) -> list[dict[str, Any]]:
    """The full fundsIndex (with a stable fundId added to each entry)."""
    return search.with_ids(FUNDS_INDEX)


@app.get("/api/search")
def get_search(q: str = Query(default="")) -> list[dict[str, Any]]:
    """Ranked fund matches by name, AMC, or category field."""
    return search.search(FUNDS_INDEX, q)


@app.get("/api/market/indexes")
def get_market_indexes() -> dict[str, Any]:
    """Fixed broader-market index catalog used by the dashboard."""
    return {"indexes": list_market_indexes()}


@app.get("/api/market/indexes/quotes")
def get_market_index_quotes() -> dict[str, Any]:
    """Live quotes for Nifty 50 / 100 / 500 / Midcap 150 / Smallcap 250."""
    return {"quotes": get_all_index_quotes()}


@app.get("/api/market/indexes/history")
def get_market_indexes_history_route(
    start: str = Query(..., description="Portfolio / series start date YYYY-MM-DD"),
    end: str | None = Query(default=None, description="End date YYYY-MM-DD (default: today)"),
    symbols: str | None = Query(
        default=None,
        description="Comma-separated NSE symbols; default = full catalog",
    ),
) -> dict[str, Any]:
    """Daily closes for one or more catalog indexes over a shared date window."""
    catalog = list_market_indexes()
    if symbols and symbols.strip():
        requested = [part.strip() for part in symbols.split(",") if part.strip()]
    else:
        requested = [item["symbol"] for item in catalog]

    series = get_indexes_history(requested, start, end)
    return {"start": start, "end": end, "series": series}


@app.get("/api/market/indexes/{symbol}/quote")
def get_market_index_quote(symbol: str) -> dict[str, Any]:
    try:
        return get_index_quote(symbol)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch index quote: {exc}",
        ) from exc


@app.get("/api/market/indexes/{symbol}/history")
def get_market_index_history_route(
    symbol: str,
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str | None = Query(default=None, description="End date YYYY-MM-DD (default: today)"),
) -> dict[str, Any]:
    """Daily closes from start through end for one catalog index."""
    try:
        points = get_index_history(symbol, start, end)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {
        "symbol": symbol,
        "label": next(
            (item["label"] for item in list_market_indexes() if item["symbol"] == symbol),
            symbol,
        ),
        "start": start,
        "end": end,
        "points": points,
    }


@app.get("/api/categories")
def get_categories() -> list[dict[str, Any]]:
    """Trimmed list of categories: { id, chip, title, desc }."""
    return [
        {
            "id": c["id"],
            "chip": c["chip"],
            "title": c["title"],
            "desc": c["desc"],
        }
        for c in CATEGORIES
    ]


@app.get("/api/categories/{category_id}")
def get_category(category_id: str) -> dict[str, Any]:
    """The full category object."""
    category = CATEGORY_BY_ID.get(category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    out = dict(category)
    if out.get("cards"):
        out["cards"] = [
            {
                **card,
                "fundId": card.get("fundId")
                or FUND_ID_BY_NAME.get(card["name"], search.slugify(card["name"])),
            }
            for card in out["cards"]
        ]
    if out.get("single"):
        single = dict(out["single"])
        single["fundId"] = single.get("fundId") or FUND_ID_BY_NAME.get(
            single["name"],
            search.slugify(single["name"]),
        )
        out["single"] = single
    return out


@app.get("/api/funds/{fund_id}")
def get_fund(fund_id: str) -> dict[str, Any]:
    """A fund's index entry + its categoryId (already present in the entry)."""
    fund = search.find_fund(FUNDS_INDEX, fund_id)
    if fund is None:
        raise HTTPException(status_code=404, detail="Fund not found")
    return fund


@app.get("/api/funds/{fund_id}/nav-history")
def get_fund_nav_history(
    fund_id: str,
    period: str = "1Y",
) -> dict[str, Any]:
    """Chart-ready NAV points for a fund detail page."""
    fund = search.find_fund(FUNDS_INDEX, fund_id)
    if fund is None:
        raise HTTPException(status_code=404, detail="Fund not found")
    period = period.upper()
    if period not in PERIODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid period. Use one of: {', '.join(sorted(PERIODS))}",
        )
    return nav_history_for_fund(fund, period)


@app.get("/api/funds/{fund_id}/returns")
def get_fund_returns(fund_id: str) -> dict[str, Any]:
    """Trailing returns (1M/3M/6M/1Y) for a fund's detail-page summary table.

    A period is reported only when the fund has enough history to cover it;
    otherwise its value is null (rendered as "-" in the UI).
    """
    fund = search.find_fund(FUNDS_INDEX, fund_id)
    if fund is None:
        raise HTTPException(status_code=404, detail="Fund not found")

    scheme_code = (
        fund.get("sifCode") or fund.get("schemeCode") or fund.get("scheme_code")
    )
    empty = {p: None for p in RETURN_PERIODS}
    if not scheme_code:
        return {
            "fundId": fund.get("fundId"),
            "schemeCode": None,
            "asOf": None,
            "returns": empty,
            "message": "SIF code is not configured for this fund yet.",
        }
    scheme_code = str(scheme_code)

    try:
        from config.duckdb_session import get_connection
        from config.returns import returns_for_codes
    except Exception as exc:  # noqa: BLE001
        return {
            "fundId": fund.get("fundId"),
            "schemeCode": scheme_code,
            "asOf": None,
            "returns": empty,
            "message": f"Returns layer is unavailable: {exc}",
        }

    try:
        with get_connection() as con:
            span = con.execute(
                "SELECT MIN(nav_date), MAX(nav_date) "
                "FROM nav_history WHERE scheme_code = ?",
                [scheme_code],
            ).fetchone()
            data = returns_for_codes(con, [scheme_code], RETURN_PERIODS)
    except Exception as exc:  # noqa: BLE001
        return {
            "fundId": fund.get("fundId"),
            "schemeCode": scheme_code,
            "asOf": None,
            "returns": empty,
            "message": f"Returns could not be loaded: {exc}",
        }

    entry = data.get(scheme_code)
    if not entry or not span or span[0] is None:
        return {
            "fundId": fund.get("fundId"),
            "schemeCode": scheme_code,
            "asOf": None,
            "returns": empty,
            "message": "No NAV history is available for this fund yet.",
        }

    min_date, max_date = span[0], span[1]
    available_days = (max_date - min_date).days
    raw = entry.get("returns", {})

    # Gate each period on having enough history to make it meaningful.
    returns = {
        p: (raw.get(p) if available_days >= _RETURN_MIN_DAYS[p] else None)
        for p in RETURN_PERIODS
    }
    return {
        "fundId": fund.get("fundId"),
        "schemeCode": scheme_code,
        "asOf": entry.get("nav_date"),
        "returns": returns,
        "message": None,
    }


@app.get("/api/meta")
def get_meta() -> dict[str, Any]:
    """meta (incl. colorTokens), primerHtml, and the wherefits map."""
    return {
        "meta": DATA.get("meta", {}),
        "primerHtml": DATA.get("primerHtml", ""),
        "wherefits": DATA.get("wherefits", {}),
    }


@app.post("/api/portfolio/export-pdf")
def export_portfolio_pdf(
    body: PortfolioExportRequest,
    _: None = Depends(verify_internal_access),
) -> Response:
    """Generate a portfolio PDF report from preview payload data."""
    if not body.funds:
        raise HTTPException(status_code=400, detail="At least one fund is required.")

    payload = body.model_dump(by_alias=False)
    peer_tables = resolve_peer_tables(payload.get("funds") or [], FUNDS_INDEX, CATEGORIES)
    try:
        pdf_bytes = PortfolioReportPdf(payload, peer_tables=peer_tables).build()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=f"PDF generation failed: {exc}",
        ) from exc

    filename = portfolio_pdf_filename(body.client_name)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
