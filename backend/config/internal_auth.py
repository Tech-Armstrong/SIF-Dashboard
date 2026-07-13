"""Shared-password gate for internal portfolio and screener APIs."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import Header, HTTPException

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # pragma: no cover
    pass

INTERNAL_PASSWORD = os.environ.get("INTERNAL_PASSWORD", "").strip()
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "").strip()


def internal_auth_enabled() -> bool:
    return bool(INTERNAL_PASSWORD and INTERNAL_API_KEY)


def verify_internal_access(authorization: str | None = Header(default=None)) -> None:
    """Require Bearer token on internal-only endpoints when auth is configured."""
    if not internal_auth_enabled():
        return

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Internal access required.")

    token = authorization.removeprefix("Bearer ").strip()
    if token != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid internal access token.")
