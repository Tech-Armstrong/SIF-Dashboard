"""Neo4j Aura connection for the SIF graph layer.

Loads credentials from backend/.env (via config.constants). If Neo4j is
unreachable or env vars are missing, callers receive None and fall back to
funds.json only.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import config.constants  # noqa: F401 — ensures .env is loaded
from config.logging_utils import get_logger

if TYPE_CHECKING:
    from neo4j import Driver

log = get_logger("neo4j_session")

_driver: Driver | None = None
_initialized = False


def init_driver() -> Driver | None:
    """Create and verify the Neo4j driver once. Returns None on failure."""
    global _driver, _initialized
    if _initialized:
        return _driver
    _initialized = True

    uri = os.environ.get("NEO4J_URI")
    username = os.environ.get("NEO4J_USERNAME")
    password = os.environ.get("NEO4J_PASSWORD")
    if not all([uri, username, password]):
        log.warning("Neo4j env vars missing — using funds.json only")
        return None

    try:
        from neo4j import GraphDatabase

        driver = GraphDatabase.driver(uri, auth=(username, password))
        driver.verify_connectivity()
        log.info("Neo4j connected")
        _driver = driver
        return driver
    except Exception as exc:  # noqa: BLE001
        log.warning("Neo4j unavailable (%s) — using funds.json only", exc)
        return None


def get_driver() -> Driver | None:
    """Return the singleton driver, initializing on first call."""
    if not _initialized:
        return init_driver()
    return _driver


def close_driver() -> None:
    """Close the driver (tests / shutdown)."""
    global _driver, _initialized
    if _driver is not None:
        _driver.close()
        _driver = None
    _initialized = False
