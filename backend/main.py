"""FastAPI backend for the SIF Research Dashboard.

Loads data/funds.json once at startup into memory and serves read-only views
over it (funds, categories, search, meta). Static content is served straight
from that in-memory copy.

NAV history is the one live data path: /api/funds/{id}/nav-history queries an
in-memory DuckDB wired to NAV parquet in Azure Blob (see config/nav_history.py
and config/duckdb_session.py). There is still NO returns/ranking engine wired
to any endpoint — config/returns.py and config/scheme_matcher.py exist but are
not yet served.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

import search
from config.nav_history import PERIODS, nav_history_for_fund

# data/funds.json lives one level up from backend/.
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "funds.json"

with DATA_PATH.open("r", encoding="utf-8") as fh:
    DATA: dict[str, Any] = json.load(fh)

CATEGORIES: list[dict[str, Any]] = DATA.get("categories", [])
FUNDS_INDEX: list[dict[str, Any]] = DATA.get("fundsIndex", [])

# Precompute category lookup by id.
CATEGORY_BY_ID: dict[str, dict[str, Any]] = {c["id"]: c for c in CATEGORIES}
FUND_ID_BY_NAME: dict[str, str] = {
    f["name"]: str(f.get("sifCode") or search.slugify(f["name"]))
    for f in FUNDS_INDEX
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
            {**card, "fundId": FUND_ID_BY_NAME.get(card["name"], search.slugify(card["name"]))}
            for card in out["cards"]
        ]
    if out.get("single"):
        single = dict(out["single"])
        single["fundId"] = FUND_ID_BY_NAME.get(
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


@app.get("/api/meta")
def get_meta() -> dict[str, Any]:
    """meta (incl. colorTokens), primerHtml, and the wherefits map."""
    return {
        "meta": DATA.get("meta", {}),
        "primerHtml": DATA.get("primerHtml", ""),
        "wherefits": DATA.get("wherefits", {}),
    }
