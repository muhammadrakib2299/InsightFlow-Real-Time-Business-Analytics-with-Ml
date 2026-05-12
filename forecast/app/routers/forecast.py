"""POST /forecast and GET /models — full implementation (M3)."""

from __future__ import annotations

from datetime import date as _date

import pandas as pd
import structlog
from fastapi import APIRouter, HTTPException, status

from ..schemas import (
    ForecastPoint,
    ForecastRequest,
    ForecastResponse,
    ModelMetadata,
)
from ..services import arima_runner, prophet_runner, registry
from ..services.cache import get_cache

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["forecast"])


def _points_from_df(df: pd.DataFrame, value_col: str = "yhat") -> list[ForecastPoint]:
    out: list[ForecastPoint] = []
    for row in df.itertuples(index=False):
        out.append(
            ForecastPoint(
                ds=_to_date(row.ds),
                yhat=float(getattr(row, value_col)),
                yhat_lower=float(getattr(row, "yhat_lower", getattr(row, value_col))),
                yhat_upper=float(getattr(row, "yhat_upper", getattr(row, value_col))),
            )
        )
    return out


def _history_points(df: pd.DataFrame) -> list[ForecastPoint]:
    out: list[ForecastPoint] = []
    for row in df.itertuples(index=False):
        y = float(row.y)
        out.append(ForecastPoint(ds=_to_date(row.ds), yhat=y, yhat_lower=y, yhat_upper=y))
    return out


def _to_date(value) -> _date:  # type: ignore[no-untyped-def]
    if isinstance(value, _date) and not isinstance(value, pd.Timestamp):
        return value
    if isinstance(value, pd.Timestamp):
        return value.date()
    return pd.to_datetime(value).date()


def _serialise(ref: registry.ArtifactRef, history_pts, forecast_pts, mape) -> dict:
    return {
        "workspace_id": ref.workspace_id,
        "metric": ref.metric,
        "model_kind": ref.model_kind,
        "fitted_at": ref.fitted_at,
        "mape": mape,
        "history": [p.model_dump(mode="json") for p in history_pts],
        "forecast": [p.model_dump(mode="json") for p in forecast_pts],
    }


@router.post("/forecast", response_model=ForecastResponse)
async def post_forecast(req: ForecastRequest) -> ForecastResponse:
    workspace_id = str(req.workspace_id)
    metric = req.metric
    horizon = req.horizon_days

    ref = registry.latest(workspace_id, metric, model_kind=req.model_kind)
    if ref is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"no fitted model for ({workspace_id}, {metric}) yet — "
                "POST /retrain or wait for the nightly job"
            ),
        )

    cache = get_cache()
    cached = await cache.get(workspace_id, metric, horizon, ref.model_kind, ref.fitted_at)
    if cached:
        return ForecastResponse(**cached)

    try:
        model = registry.load(ref)
    except Exception as exc:
        logger.exception("forecast.load_failed", path=str(ref.artifact_path))
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, f"failed to load model artifact: {exc}"
        ) from exc

    if ref.model_kind == "prophet":
        history_df = _prophet_history_df(model)
        band = prophet_runner.forecast_from_artifact(
            model, history=history_df, horizon_days=horizon
        )
        history_pts = _history_points(band.history)
        forecast_pts = _points_from_df(band.forecast)
    elif ref.model_kind == "arima":
        out = arima_runner.forecast_from_artifact(model, horizon_days=horizon)
        history_pts = _history_points(out["history"])
        forecast_pts = _points_from_df(out["forecast"])
    else:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"unknown model_kind in registry: {ref.model_kind}",
        )

    payload = _serialise(ref, history_pts, forecast_pts, ref.mape)
    await cache.set(workspace_id, metric, horizon, ref.model_kind, ref.fitted_at, payload)
    return ForecastResponse(**payload)


def _prophet_history_df(model) -> pd.DataFrame:  # type: ignore[no-untyped-def]
    """Reconstruct the (ds, y) frame Prophet was trained on."""
    hist = getattr(model, "history", None)
    if hist is None:
        return pd.DataFrame(columns=["ds", "y"])
    return hist[["ds", "y"]].copy()


@router.get("/models", response_model=list[ModelMetadata])
async def get_models() -> list[ModelMetadata]:
    return [
        ModelMetadata(
            workspace_id=r.workspace_id,  # type: ignore[arg-type]
            metric=r.metric,
            model_kind=r.model_kind,  # type: ignore[arg-type]
            fitted_at=r.fitted_at,
            training_window_days=r.training_window_days,
            mape=r.mape,
        )
        for r in registry.list_models()
    ]
