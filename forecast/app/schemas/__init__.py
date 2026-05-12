"""Pydantic schemas exposed by the forecast service."""

from __future__ import annotations

from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


ModelKind = Literal["prophet", "arima"]


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: UUID
    metric: str = Field(min_length=1, max_length=64)
    horizon_days: int = Field(default=30, ge=1, le=365)
    model_kind: ModelKind | None = None


class ForecastPoint(BaseModel):
    ds: date
    yhat: float
    yhat_lower: float
    yhat_upper: float


class ForecastResponse(BaseModel):
    workspace_id: UUID
    metric: str
    model_kind: ModelKind
    fitted_at: str
    mape: float | None = None
    history: list[ForecastPoint]
    forecast: list[ForecastPoint]


class RetrainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: UUID | None = None  # None = all workspaces
    metric: str | None = None


class RetrainResponse(BaseModel):
    queued: int
    detail: str


class ModelMetadata(BaseModel):
    workspace_id: UUID
    metric: str
    model_kind: ModelKind
    fitted_at: str
    training_window_days: int
    mape: float | None = None


class AnomalyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: UUID
    metric: str
    method: Literal["zscore", "iqr"] = "zscore"
    window_days: int = Field(default=7, ge=2, le=90)
    threshold: float = Field(default=3.0, gt=0)


class AnomalyPoint(BaseModel):
    ds: date
    value: float
    expected: float | None = None
    is_anomaly: bool


class AnomalyResponse(BaseModel):
    workspace_id: UUID
    metric: str
    method: Literal["zscore", "iqr"]
    points: list[AnomalyPoint]
