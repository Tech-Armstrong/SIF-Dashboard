"""Request models for internal auth endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class InternalLoginRequest(BaseModel):
    password: str = Field(min_length=1)
