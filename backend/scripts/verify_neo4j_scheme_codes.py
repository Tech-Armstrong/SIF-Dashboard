"""Verify Neo4j Fund.scheme_code values resolve to NAV data in Azure Blob.

Run from backend/:
    python scripts/verify_neo4j_scheme_codes.py

Uses DuckDB when available (Linux/Docker); falls back to Azure SDK on Windows
where DuckDB's azure extension often hits SSL errors.
"""

from __future__ import annotations

import io
import logging
import os
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

import config.constants  # noqa: F401
from config.constants import AZURE_CONNECTION_STRING, BLOB_CONTAINER
from config.neo4j_session import init_driver
from data.merge import build_merged_data

import json

DATA_PATH = _BACKEND.parent / "data" / "funds.json"

_NEO4J_QUERY = """
MATCH (f:Fund)
RETURN f.fund_id AS id, f.name AS name, f.scheme_code AS code
ORDER BY id
"""


def _neo4j_funds(driver) -> list[dict]:
    db = os.environ.get("NEO4J_DATABASE", "neo4j")
    with driver.session(database=db) as s:
        return [dict(r) for r in s.run(_NEO4J_QUERY)]


def _verify_duckdb(codes: set[str]) -> dict[str, dict] | None:
    try:
        from config.duckdb_session import get_connection
    except Exception:
        return None
    try:
        with get_connection() as con:
            out: dict[str, dict] = {}
            for code in sorted(codes):
                row = con.execute(
                    """
                    SELECT COUNT(*), MIN(nav_date), MAX(nav_date)
                    FROM nav_history WHERE scheme_code = ?
                    """,
                    [code],
                ).fetchone()
                out[code] = {
                    "nav_rows": int(row[0]),
                    "first_date": str(row[1]) if row[1] else None,
                    "last_date": str(row[2]) if row[2] else None,
                    "via": "duckdb",
                }
            return out
    except Exception as exc:
        print(f"[INFO] DuckDB path unavailable ({exc}); using Azure SDK fallback.")
        return None


def _verify_azure_sdk(codes: set[str]) -> dict[str, dict]:
    import pyarrow.parquet as pq
    from azure.storage.blob import BlobServiceClient

    logging.getLogger("azure").setLevel(logging.WARNING)
    client = BlobServiceClient.from_connection_string(AZURE_CONNECTION_STRING)
    master_blob = client.get_blob_client(BLOB_CONTAINER, "processed/scheme_master.parquet")
    master_table = pq.read_table(io.BytesIO(master_blob.download_blob().readall()))
    master_codes = {str(c) for c in master_table.column("scheme_code").to_pylist()}

    counts = {c: 0 for c in codes}
    last_dates: dict[str, str] = {}
    container = client.get_container_client(BLOB_CONTAINER)
    for blob in container.list_blobs(name_starts_with="processed/nav_history/year="):
        if not blob.name.endswith(".parquet"):
            continue
        data = client.get_blob_client(BLOB_CONTAINER, blob.name).download_blob().readall()
        table = pq.read_table(io.BytesIO(data), columns=["scheme_code", "nav_date"])
        sc_col = table.column("scheme_code").to_pylist()
        dt_col = table.column("nav_date").to_pylist()
        for raw_code, raw_date in zip(sc_col, dt_col):
            code = str(raw_code)
            if code in counts:
                counts[code] += 1
                ds = str(raw_date)
                if code not in last_dates or ds > last_dates[code]:
                    last_dates[code] = ds

    return {
        c: {
            "nav_rows": counts[c],
            "last_date": last_dates.get(c),
            "in_master": c in master_codes,
            "via": "azure-sdk",
        }
        for c in codes
    }


def main() -> int:
    print("=" * 72)
    print("Neo4j scheme_code -> Blob NAV verification")
    print("=" * 72)

    driver = init_driver()
    if driver is None:
        print("[FAIL] Neo4j unavailable - check backend/.env")
        return 1
    if not AZURE_CONNECTION_STRING:
        print("[FAIL] AZURE_STORAGE_CONNECTION_STRING not set")
        return 1

    graph_funds = _neo4j_funds(driver)
    print(f"\nNeo4j: {len(graph_funds)} Fund nodes")

    with DATA_PATH.open(encoding="utf-8") as fh:
        merged = build_merged_data(json.load(fh), driver)
    merged_by_gid = {
        str(f["graphFundId"]): f for f in merged["fundsIndex"] if f.get("graphFundId")
    }

    codes = {str(f["code"]) for f in graph_funds if f["code"]}
    stats = _verify_duckdb(codes) or _verify_azure_sdk(codes)
    via = next(iter(stats.values()))["via"]
    print(f"Blob lookup via: {via}")

    ok = no_code = no_nav = merge_miss = 0
    print("\n" + "-" * 72)
    print(f"{'fund_id':<8} {'scheme_code':<10} {'nav_rows':<10} {'last_date':<12} status")
    print("-" * 72)

    for f in graph_funds:
        fid = str(f["id"])
        code = f["code"]
        if not code:
            no_code += 1
            print(f"{fid:<8} {'-':<10} {'-':<10} {'-':<12} MISSING scheme_code")
            continue

        code = str(code)
        s = stats[code]
        merged_entry = merged_by_gid.get(fid, {})
        merged_code = merged_entry.get("sifCode")
        if merged_code != code:
            merge_miss += 1
            print(
                f"{fid:<8} {code:<10} {'-':<10} {'-':<12} "
                f"[FAIL] merge sifCode={merged_code!r} (expected {code})"
            )
            continue

        n = s["nav_rows"]
        if n == 0 or (via == "azure-sdk" and not s.get("in_master", True)):
            no_nav += 1
            print(f"{fid:<8} {code:<10} {n:<10} {'-':<12} [FAIL] no NAV in Blob")
            continue

        ok += 1
        print(
            f"{fid:<8} {code:<10} {n:<10} {s.get('last_date') or '-':<12} "
            f"[OK]  ({f['name']})"
        )

    print("-" * 72)
    print(
        f"\nSummary: {ok} ok | {no_nav} no Blob NAV | {no_code} missing on graph | "
        f"{merge_miss} merge mismatch | {len(graph_funds)} total"
    )

    if ok == len(graph_funds):
        print("\n[PASS] All Neo4j scheme_code values resolve to Blob NAV data.")
        print("Merge layer uses graph scheme_code as sifCode (JSON fallback not needed).")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
