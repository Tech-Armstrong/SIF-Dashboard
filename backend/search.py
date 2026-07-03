"""Search / filter helpers for the SIF dashboard.

Intentionally thin: pure functions over the in-memory fundsIndex + categories.
No NAV or returns logic here — that lives in config/nav_history.py.
"""

from __future__ import annotations

import re
from typing import Any

_slug_re = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    """Stable slug derived from a string (must match the frontend slugify)."""
    value = value.strip().lower()
    value = _slug_re.sub("-", value)
    return value.strip("-")


def _norm(value: str) -> str:
    return value.strip().lower()


def resolve_fund_id(entry: dict[str, Any]) -> str:
    """Stable public fund id: preset fundId, sifCode, graph id, or name slug."""
    return str(
        entry.get("fundId")
        or entry.get("sifCode")
        or entry.get("schemeCode")
        or entry.get("graphFundId")
        or slugify(entry["name"])
    )


def with_ids(funds_index: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return a copy of fundsIndex with a stable `fundId` on each entry."""
    out: list[dict[str, Any]] = []
    for entry in funds_index:
        item = dict(entry)
        item["fundId"] = resolve_fund_id(entry)
        out.append(item)
    return out


def find_fund(funds_index: list[dict[str, Any]], fund_id: str) -> dict[str, Any] | None:
    """Find a fund by sifCode, Neo4j graphFundId, preset fundId, or name slug."""
    for entry in funds_index:
        candidates = {
            str(entry.get("fundId") or ""),
            str(entry.get("sifCode") or ""),
            str(entry.get("schemeCode") or ""),
            str(entry.get("graphFundId") or ""),
            slugify(entry["name"]),
        }
        if fund_id in candidates:
            item = dict(entry)
            item["fundId"] = resolve_fund_id(entry)
            return item
    return None


def search(
    funds_index: list[dict[str, Any]],
    categories: list[dict[str, Any]],
    query: str,
) -> list[dict[str, Any]]:
    """Rank-and-filter funds (name/amc/category) plus matched categories.

    Ranking: exact-prefix matches first, then substring matches, then the rest.
    Returns fund results ({type:"fund", ...entry, fundId}) followed by any
    matched category results ({type:"category", id, title}).
    """
    q = _norm(query)
    if not q:
        # Empty query: return the full index (with ids), no category rows.
        return [{"type": "fund", **f} for f in with_ids(funds_index)]

    scored: list[tuple[int, int, dict[str, Any]]] = []
    for idx, entry in enumerate(funds_index):
        name = _norm(entry["name"])
        amc = _norm(entry["amc"])
        category = _norm(entry["category"])
        sif_code = _norm(str(entry.get("sifCode", "")))

        score = None
        # Lower score == higher rank.
        if sif_code and sif_code == q:
            score = 0
        elif name.startswith(q):
            score = 0
        elif sif_code.startswith(q) or amc.startswith(q) or category.startswith(q):
            score = 1
        elif q in name:
            score = 2
        elif q in sif_code or q in amc or q in category:
            score = 3

        if score is not None:
            item = dict(entry)
            item["fundId"] = resolve_fund_id(entry)
            item["type"] = "fund"
            scored.append((score, idx, item))

    scored.sort(key=lambda t: (t[0], t[1]))
    results: list[dict[str, Any]] = [item for _, _, item in scored]

    # Matched categories (by title or chip), de-duplicated, order preserved.
    for cat in categories:
        title = _norm(cat.get("title", ""))
        chip = _norm(cat.get("chip", ""))
        cat_id = _norm(cat.get("id", ""))
        if q in title or q in chip or q in cat_id:
            results.append(
                {"type": "category", "id": cat["id"], "title": cat["title"]}
            )

    return results
