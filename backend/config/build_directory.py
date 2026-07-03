"""One-off: extract the scheme directory (the matching dictionary) from the
standardised MF API Excel into backend/data/scheme_directory.csv.

The CSV is the committed source of truth the matcher loads at runtime, so the
large .xlsx never has to ship with / be read by the API.

Run from backend/:
    python -m config.build_directory  ["path\\to\\standardised.xlsx"]

Output columns:
    scheme_code, scheme_name, category_type, category, has_nav
`has_nav` marks the codes that currently have NAV history in the Blob DB (135),
so the dashboard can instantly tell which matched funds will return live data.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from config.constants import ROOT_DIR
from config.logging_utils import get_logger

log = get_logger("build_directory")

DEFAULT_XLSX = ROOT_DIR.parent / "MF API Standardised Data with Links (2).xlsx"
OUT_CSV = ROOT_DIR / "data" / "scheme_directory.csv"


def _db_codes_with_nav() -> set[str]:
    """scheme_codes that actually have NAV history (so has_nav is truthful).
    Falls back to empty set if the Blob connection isn't available."""
    try:
        from config.duckdb_session import get_connection

        with get_connection() as con:
            rows = con.execute("SELECT DISTINCT scheme_code FROM scheme_master").fetchall()
        return {str(r[0]) for r in rows}
    except Exception as exc:  # noqa: BLE001
        log.warning("Could not read DB codes for has_nav (%s); marking all 0.", exc)
        return set()


def build(xlsx_path: Path) -> Path:
    log.info("Reading standardised directory: %s", xlsx_path)
    df = pd.read_excel(xlsx_path, sheet_name="Regular", engine="openpyxl")

    # Column names in the file have stray spaces; normalize access.
    cols = {c.strip().lower(): c for c in df.columns}
    code_c = cols["schemecode"]
    name_c = cols["schemename"]
    cattype_c = cols.get("category type")
    cat_c = cols.get("category")

    out = pd.DataFrame({
        "scheme_code": df[code_c].astype("int64").astype(str),
        "scheme_name": df[name_c].astype(str).str.strip(),
        "category_type": (df[cattype_c].astype(str).str.strip()
                          if cattype_c else ""),
        "category": (df[cat_c].astype(str).str.strip() if cat_c else ""),
    })
    out = out.drop_duplicates(subset="scheme_code").reset_index(drop=True)

    nav_codes = _db_codes_with_nav()
    out["has_nav"] = out["scheme_code"].isin(nav_codes).astype(int)

    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT_CSV, index=False, encoding="utf-8")
    log.info("Wrote %d schemes -> %s  (%d with NAV)",
             len(out), OUT_CSV, int(out["has_nav"].sum()))
    return OUT_CSV


if __name__ == "__main__":
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.exists():
        raise SystemExit(f"Standardised xlsx not found: {xlsx}")
    build(xlsx)
