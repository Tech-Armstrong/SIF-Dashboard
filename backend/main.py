"""FastAPI backend for the SIF Research Dashboard.

Loads data/funds.json once at startup, merges structured fund data from Neo4j
when available, and serves read-only views over the combined in-memory copy.

NAV history is the one live data path: /api/funds/{id}/nav-history queries an
in-memory DuckDB wired to NAV parquet in Azure Blob (see config/nav_history.py
and config/duckdb_session.py).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import search
from config.nav_history import PERIODS, nav_history_for_fund
from config.neo4j_session import init_driver
from data.merge import build_merged_data

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

# CORS for the Next.js dev origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/funds")
def get_funds() -> list[dict[str, Any]]:
    """The full fundsIndex (with a stable fundId added to each entry)."""
    return search.with_ids(FUNDS_INDEX)


@app.get("/api/search")
def get_search(q: str = Query(default="")) -> list[dict[str, Any]]:
    """Ranked fund matches (name/amc/category) plus any matched categories."""
    return search.search(FUNDS_INDEX, CATEGORIES, q)


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
