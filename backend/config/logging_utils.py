"""Tiny logging helper so every module logs the same way.

    from config.logging_utils import get_logger
    log = get_logger("duckdb_session")
    log.info("connected")
"""
from __future__ import annotations

import logging
import os

_CONFIGURED = False


def _configure_root() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    logging.basicConfig(
        level=level,
        format="%(asctime)s  %(levelname)-7s  %(name)s  %(message)s",
        datefmt="%H:%M:%S",
    )
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    """Return a configured logger. Idempotent — safe to call from any module."""
    _configure_root()
    return logging.getLogger(name)
