"""Merge Neo4j graph data with funds.json presentation content.

Neo4j is primary for structured fund/category fields; JSON fills gaps
(accent, sifCode, AUM/NAV facts, comparison sections).
"""

from __future__ import annotations

import os
import re
from datetime import date
from typing import Any

import search
from config.logging_utils import get_logger

log = get_logger("data.merge")

CATEGORY_SLUG_BY_ID: dict[int, str] = {
    1: "equity-long-short",
    2: "ex-top-100-long-short",
    3: "sector-rotation-long-short",
    4: "hybrid-long-short",
    5: "active-asset-allocator-long-short",
}

PREFIX_COLORS: dict[str, str] = {
    "isif": "var(--isif)",
    "qsif": "var(--qsif)",
    "wsif": "var(--isif)",
    "dynasif": "var(--dyna)",
    "arudha": "var(--arudha)",
    "diviniti": "var(--diviniti)",
    "titanium": "var(--titanium)",
    "sapphire": "var(--sapphire)",
    "altiva": "var(--altiva)",
    "apex": "var(--apex)",
    "magnum": "var(--magnum)",
    "platinum": "var(--accent)",
    "arthaya": "var(--accent)",
}

_JSON_ONLY_FACT_KEYS = frozenset({"AUM", "NAV (Reg)"})
_FACT_ORDER = (
    "Inception",
    "Benchmark",
    "AUM",
    "NAV (Reg)",
    "Fund Managers",
    "Exit Load",
    "Taxation",
    "Plans",
    "Options",
)

_GRAPH_QUERY = """
MATCH (a:AMC)-[:MANAGES]->(f:Fund)-[:BELONGS_TO]->(c:Category)
OPTIONAL MATCH (f)-[:MANAGED_BY]->(fm:FundManager)
WITH f, a, c, f.name AS fund_name, collect(DISTINCT fm.name) AS managers
RETURN f.fund_id AS fund_id,
       properties(f) AS fund_props,
       a.name AS amc,
       c.category_id AS category_id,
       c.name AS category_name,
       properties(c) AS category_props,
       managers
ORDER BY fund_name
"""


def normalize_fund_name(name: str) -> str:
    """Normalize fund names so Neo4j and JSON entries can be joined."""
    n = name.strip().lower().replace("-", " ")
    n = re.sub(r"\s+", " ", n)
    for suffix in (" fund sif", " fund", " sif"):
        if n.endswith(suffix):
            n = n[: -len(suffix)].strip()
    return n


def _format_inception(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, date):
        d = value
    elif hasattr(value, "year"):
        d = date(int(value.year), int(value.month), int(value.day))
    else:
        return str(value)
    return f"{d.day} {d.strftime('%b %Y')}"


def infer_accent(name: str) -> str:
    lower = name.strip().lower()
    for prefix, color in sorted(PREFIX_COLORS.items(), key=lambda item: -len(item[0])):
        if lower.startswith(prefix):
            return color
    return "var(--accent)"


def _brand_short(name: str) -> str:
    """First token of the fund name (e.g. iSIF, qsif)."""
    return name.strip().split()[0] if name.strip() else name


def _merge_facts(
    graph: dict[str, Any],
    json_facts: list[list[str]] | None,
) -> list[list[str]]:
    """Build facts: Neo4j wins on overlap; JSON keeps AUM/NAV-only keys."""
    merged: dict[str, str] = {}

    if json_facts:
        for key, value in json_facts:
            if key in _JSON_ONLY_FACT_KEYS and value:
                merged[key] = value

    inception = _format_inception(graph.get("inception_date"))
    if inception:
        merged["Inception"] = inception
    if graph.get("benchmark"):
        merged["Benchmark"] = str(graph["benchmark"])
    managers = [m for m in graph.get("managers", []) if m]
    if managers:
        merged["Fund Managers"] = " · ".join(managers)
    if graph.get("exit_load"):
        merged["Exit Load"] = str(graph["exit_load"])
    if graph.get("taxation"):
        merged["Taxation"] = str(graph["taxation"])
    plans = graph.get("plans") or []
    if plans:
        merged["Plans"] = ", ".join(str(p) for p in plans)
    options = graph.get("options") or []
    if options:
        merged["Options"] = ", ".join(str(o) for o in options)

    if json_facts:
        for key, value in json_facts:
            if key not in merged and value:
                merged[key] = value

    ordered: list[list[str]] = []
    seen: set[str] = set()
    for key in _FACT_ORDER:
        if key in merged:
            ordered.append([key, merged[key]])
            seen.add(key)
    for key, value in merged.items():
        if key not in seen:
            ordered.append([key, value])
    return ordered


def _load_graph_funds(driver: Any) -> list[dict[str, Any]]:
    database = os.environ.get("NEO4J_DATABASE", "neo4j")
    rows: list[dict[str, Any]] = []
    with driver.session(database=database) as session:
        for record in session.run(_GRAPH_QUERY):
            fund_props = dict(record["fund_props"])
            rows.append(
                {
                    "fund_id": fund_props.get("fund_id", record["fund_id"]),
                    "name": fund_props.get("name", ""),
                    "amc": record["amc"],
                    "category_id": record["category_id"],
                    "category_name": record["category_name"],
                    "category_props": dict(record["category_props"]),
                    "managers": list(record["managers"] or []),
                    "inception_date": fund_props.get("inception_date"),
                    "benchmark": fund_props.get("benchmark"),
                    "exit_load": fund_props.get("exit_load"),
                    "taxation": fund_props.get("taxation"),
                    "plans": fund_props.get("plans"),
                    "options": fund_props.get("options"),
                }
            )
    return rows


def _merge_fund_entry(
    graph: dict[str, Any],
    json_entry: dict[str, Any] | None,
) -> dict[str, Any]:
    category_slug = CATEGORY_SLUG_BY_ID.get(int(graph["category_id"]), "")
    graph_fund_id = str(graph["fund_id"])
    json_facts = json_entry.get("facts") if json_entry else None

    merged: dict[str, Any] = {
        "name": graph["name"],
        "amc": graph["amc"],
        "category": graph["category_name"],
        "categoryId": category_slug,
        "graphFundId": graph_fund_id,
        "accent": json_entry.get("accent") if json_entry else infer_accent(graph["name"]),
        "facts": _merge_facts(graph, json_facts),
    }

    if json_entry:
        if json_entry.get("sifCode"):
            merged["sifCode"] = json_entry["sifCode"]
        if json_entry.get("schemeCode"):
            merged["schemeCode"] = json_entry["schemeCode"]

    merged["fundId"] = str(
        merged.get("sifCode") or merged.get("schemeCode") or graph_fund_id
    )

    if graph.get("exit_load"):
        merged["exitLoad"] = graph["exit_load"]
    if graph.get("taxation"):
        merged["taxation"] = graph["taxation"]
    if graph.get("plans"):
        merged["plans"] = graph["plans"]
    if graph.get("options"):
        merged["options"] = graph["options"]

    return merged


def _fund_to_card(fund: dict[str, Any]) -> dict[str, Any]:
    return {
        "ac": fund["accent"],
        "amc": fund["amc"],
        "name": fund["name"],
        "fundId": fund["fundId"],
        "facts": fund["facts"],
    }


def _category_desc(props: dict[str, Any]) -> str:
    parts: list[str] = []
    if props.get("structure"):
        parts.append(str(props["structure"]))
    if props.get("min_equity_pct") is not None:
        parts.append(f"min {props['min_equity_pct']}% equity")
    if props.get("min_debt_pct") is not None:
        parts.append(f"min {props['min_debt_pct']}% debt")
    if props.get("max_short_pct") is not None:
        parts.append(f"up to {props['max_short_pct']}% unhedged short")
    if props.get("max_sectors") is not None:
        parts.append(f"max {props['max_sectors']} sectors")
    return ". ".join(parts) + ("." if parts else "")


def _synthesize_category(
    category_id: int,
    category_props: dict[str, Any],
    funds_in_category: list[dict[str, Any]],
) -> dict[str, Any]:
    slug = CATEGORY_SLUG_BY_ID[category_id]
    title = str(category_props.get("name") or slug.replace("-", " ").title())
    chip = f"Hybrid · {title}" if category_id == 5 else title
    cols = [
        {"short": _brand_short(f["name"]), "amc": f["amc"].split()[0], "color": f["accent"]}
        for f in funds_in_category
    ]
    return {
        "id": slug,
        "chip": chip,
        "chipColor": "var(--accent)",
        "title": title,
        "desc": _category_desc(category_props),
        "cols": cols,
        "cards": [_fund_to_card(f) for f in funds_in_category],
        "single": None,
        "sections": [],
        "wherefits": None,
    }


def _enrich_json_category(
    category: dict[str, Any],
    funds_by_category: dict[str, list[dict[str, Any]]],
    json_card_names: set[str],
) -> dict[str, Any]:
    """Merge Neo4j facts into JSON cards and append Neo4j-only funds."""
    out = dict(category)
    slug = category["id"]
    graph_funds = funds_by_category.get(slug, [])
    graph_by_name = {normalize_fund_name(f["name"]): f for f in graph_funds}

    if out.get("cards"):
        enriched_cards = []
        for card in out["cards"]:
            card_copy = dict(card)
            match = graph_by_name.get(normalize_fund_name(card["name"]))
            if match:
                card_copy["facts"] = match["facts"]
                card_copy["fundId"] = match["fundId"]
                card_copy["amc"] = match["amc"]
            else:
                card_copy["fundId"] = card_copy.get(
                    "fundId",
                    search.slugify(card["name"]),
                )
            enriched_cards.append(card_copy)
        out["cards"] = enriched_cards

    if out.get("single"):
        single = dict(out["single"])
        match = graph_by_name.get(normalize_fund_name(single["name"]))
        if match:
            single["facts"] = match["facts"]
            single["fundId"] = match["fundId"]
            single["amc"] = match["amc"]
        else:
            single["fundId"] = single.get("fundId", search.slugify(single["name"]))
        out["single"] = single

    existing_names = set(json_card_names)
    if out.get("single"):
        existing_names.add(normalize_fund_name(out["single"]["name"]))
    extra_cards = [
        _fund_to_card(f)
        for f in graph_funds
        if normalize_fund_name(f["name"]) not in existing_names
    ]
    if extra_cards:
        current_cards = list(out.get("cards") or [])
        out["cards"] = current_cards + extra_cards

    return out


def build_merged_data(
    data: dict[str, Any],
    driver: Any | None,
) -> dict[str, Any]:
    """Build merged fundsIndex and categories from Neo4j + JSON."""
    json_index: list[dict[str, Any]] = data.get("fundsIndex", [])
    json_categories: list[dict[str, Any]] = data.get("categories", [])

    if driver is None:
        log.info("Building data from funds.json only")
        return {
            "fundsIndex": json_index,
            "categories": [dict(c) for c in json_categories],
        }

    graph_funds = _load_graph_funds(driver)
    json_by_name = {normalize_fund_name(f["name"]): f for f in json_index}

    merged_index: list[dict[str, Any]] = []
    for graph in graph_funds:
        json_entry = json_by_name.get(normalize_fund_name(graph["name"]))
        merged_index.append(_merge_fund_entry(graph, json_entry))

    log.info("Merged %d funds from Neo4j (%d JSON overlaps)", len(merged_index), len(json_by_name))

    funds_by_category: dict[str, list[dict[str, Any]]] = {}
    category_props_by_id: dict[int, dict[str, Any]] = {}
    for fund in merged_index:
        slug = fund["categoryId"]
        funds_by_category.setdefault(slug, []).append(fund)

    for graph in graph_funds:
        cid = int(graph["category_id"])
        if cid not in category_props_by_id:
            category_props_by_id[cid] = graph["category_props"]

    json_category_ids = {c["id"] for c in json_categories}
    json_card_names_by_category: dict[str, set[str]] = {}
    for cat in json_categories:
        names: set[str] = set()
        for card in cat.get("cards") or []:
            names.add(normalize_fund_name(card["name"]))
        if cat.get("single"):
            names.add(normalize_fund_name(cat["single"]["name"]))
        json_card_names_by_category[cat["id"]] = names

    merged_categories: list[dict[str, Any]] = []
    for cat in json_categories:
        merged_categories.append(
            _enrich_json_category(
                cat,
                funds_by_category,
                json_card_names_by_category.get(cat["id"], set()),
            )
        )

    if "active-asset-allocator-long-short" not in json_category_ids:
        props = category_props_by_id.get(5, {"name": "Active Asset Allocator Long-Short"})
        merged_categories.append(
            _synthesize_category(
                5,
                props,
                funds_by_category.get("active-asset-allocator-long-short", []),
            )
        )

    return {
        "fundsIndex": merged_index,
        "categories": merged_categories,
    }
