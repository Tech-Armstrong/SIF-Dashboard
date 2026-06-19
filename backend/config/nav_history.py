"""NAV history lookup for dashboard fund detail charts."""
from __future__ import annotations

from datetime import date
from typing import Any

PERIODS: set[str] = {"1M", "3M", "6M", "YTD", "1Y", "3Y", "5Y", "ALL"}

_PERIOD_SQL: dict[str, str] = {
    "1M": "latest.max_date - INTERVAL 1 MONTH",
    "3M": "latest.max_date - INTERVAL 3 MONTH",
    "6M": "latest.max_date - INTERVAL 6 MONTH",
    "1Y": "latest.max_date - INTERVAL 1 YEAR",
    "3Y": "latest.max_date - INTERVAL 3 YEAR",
    "5Y": "latest.max_date - INTERVAL 5 YEAR",
    "YTD": "date_trunc('year', latest.max_date)",
}


def _iso(value: Any) -> str | None:
    if isinstance(value, date):
        return value.isoformat()
    return str(value) if value is not None else None


def nav_history_for_fund(
    fund: dict[str, Any],
    period: str = "1Y",
) -> dict[str, Any]:
    """Match a dashboard fund to Blob NAV data and return chart-ready points."""
    period = period.upper()
    if period not in PERIODS:
        raise ValueError(f"Unknown period {period!r}. Valid: {sorted(PERIODS)}")

    direct_code = fund.get("sifCode") or fund.get("schemeCode") or fund.get("scheme_code")
    if direct_code:
        scheme_code = str(direct_code)
        base: dict[str, Any] = {
            "fundId": fund.get("fundId"),
            "period": period,
            "status": "ok",
            "schemeCode": scheme_code,
            "matchedName": fund.get("name"),
            "matchStatus": "static_data",
            "matchScore": 1,
            "hasNav": True,
            "asOf": None,
            "points": [],
            "message": None,
        }
    else:
        return {
            "fundId": fund.get("fundId"),
            "period": period,
            "status": "missing_scheme_code",
            "schemeCode": None,
            "matchedName": None,
            "matchStatus": "missing_static_code",
            "matchScore": 0,
            "hasNav": False,
            "asOf": None,
            "points": [],
            "message": (
                "SIF code is not configured for this fund yet."
            ),
        }

    try:
        from config.duckdb_session import get_connection
    except Exception as exc:  # noqa: BLE001
        base["status"] = "unavailable"
        base["message"] = f"NAV query layer is unavailable: {exc}"
        return base

    try:
        with get_connection() as con:
            # The JOIN ... USING (scheme_code) against `latest` already restricts
            # h to this fund's code, so no extra h.scheme_code filter is needed.
            # `period` is validated against PERIODS before we get here, and the
            # interval expression is a fixed internal constant (never user input),
            # so it is safe to inline; scheme_code is the only bound parameter.
            period_filter = (
                f"WHERE h.nav_date >= {_PERIOD_SQL[period]}"
                if period != "ALL"
                else ""
            )

            rows = con.execute(
                f"""
                WITH latest AS (
                    SELECT scheme_code, MAX(nav_date) AS max_date
                    FROM nav_history
                    WHERE scheme_code = ?
                    GROUP BY scheme_code
                )
                SELECT h.nav_date, h.nav
                FROM nav_history h
                JOIN latest USING (scheme_code)
                {period_filter}
                ORDER BY h.nav_date
                """,
                [scheme_code],
            ).fetchall()
    except Exception as exc:  # noqa: BLE001
        base["status"] = "unavailable"
        base["message"] = f"NAV data could not be loaded: {exc}"
        return base

    points = [{"date": _iso(row[0]), "nav": float(row[1])} for row in rows]
    base["points"] = points
    base["asOf"] = points[-1]["date"] if points else None
    if not points:
        base["status"] = "no_nav"
        base["message"] = "No NAV points were returned for this period."
    return base
