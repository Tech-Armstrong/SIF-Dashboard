"""Request models for portfolio report endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PortfolioNavPoint(BaseModel):
    date: str
    index: float
    value: float


class PortfolioSeriesPayload(BaseModel):
    base_date: str | None = Field(default=None, alias="baseDate")
    total_return_pct: float | None = Field(default=None, alias="totalReturnPct")
    current_value: float = Field(alias="currentValue")
    excluded_fund_count: int = Field(default=0, alias="excludedFundCount")
    points: list[PortfolioNavPoint] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class PortfolioFundPayload(BaseModel):
    fund_id: str = Field(alias="fundId")
    name: str
    amc: str
    category: str
    amount: float
    percent: float
    returns: dict[str, float | None] = Field(default_factory=dict)
    facts: list[list[str]] = Field(default_factory=list)
    accent_color: str | None = Field(default=None, alias="accentColor")

    model_config = {"populate_by_name": True}


class PortfolioExportRequest(BaseModel):
    client_name: str = Field(alias="clientName")
    total_amount: float = Field(alias="totalAmount")
    funds: list[PortfolioFundPayload]
    portfolio_series: PortfolioSeriesPayload | None = Field(
        default=None,
        alias="portfolioSeries",
    )
    portfolio_base: float = Field(default=100, alias="portfolioBase")

    model_config = {"populate_by_name": True}
