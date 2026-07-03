"""Project-wide constants: paths, Azure Blob layout, and the az:// URIs that
DuckDB reads parquet from.

The Azure connection string is read from the environment (never hard-coded):
  • Locally — put it in backend/.env (gitignored).        [loaded here]
  • In CI   — provide it as a GitHub Actions secret.
"""
from __future__ import annotations

import os
from pathlib import Path

# python-dotenv is optional at import time so the package still imports in CI
# (where the string comes from a real env var, not a file). If installed, we
# load backend/.env so local runs "just work".
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # pragma: no cover - dotenv not installed
    pass

# ── Filesystem roots ──────────────────────────────────────────────────────
# ROOT_DIR = the backend/ package root (this file lives in backend/config/).
ROOT_DIR = Path(__file__).resolve().parent.parent

# ── Local data paths (staging before upload + one-time migration source) ──
RAW_NAV_DIR           = ROOT_DIR / "data" / "raw" / "nav"
PROCESSED_DIR         = ROOT_DIR / "data" / "processed"

NAV_HISTORY_PARQUET   = PROCESSED_DIR / "nav_history.parquet"
SCHEME_MASTER_PARQUET = PROCESSED_DIR / "scheme_master.parquet"

# ── Azure Blob (the source of truth — serverless lakehouse) ──────────────
# Connection string is read from the environment, never hard-coded.
# Locally: put it in a .env file (gitignored). In CI: a GitHub Actions secret.

AZURE_CONNECTION_STRING = os.environ.get("AZURE_STORAGE_CONNECTION_STRING")

BLOB_CONTAINER        = "sifnavdata"

# Logical paths inside the container. nav_history is partitioned by year so the
# daily job only rewrites the current year; old years stay frozen.
BLOB_RAW_PREFIX       = "raw/nav"                         # raw/nav/year=YYYY/*.parquet
BLOB_NAV_HISTORY_DIR  = "processed/nav_history"           # processed/nav_history/year=YYYY/data.parquet
BLOB_SCHEME_MASTER    = "processed/scheme_master.parquet"

# az:// URIs DuckDB reads from (hive_partitioning picks up the year=YYYY dirs)
AZ_NAV_HISTORY_GLOB   = f"az://{BLOB_CONTAINER}/{BLOB_NAV_HISTORY_DIR}/year=*/*.parquet"
AZ_SCHEME_MASTER      = f"az://{BLOB_CONTAINER}/{BLOB_SCHEME_MASTER}"
