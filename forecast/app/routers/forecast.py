"""POST /forecast and GET /models — placeholders, fully implemented in M3."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ..schemas import ForecastRequest, ForecastResponse, ModelMetadata
from ..services import registry

router = APIRouter(tags=["forecast"])


@router.post("/forecast", response_model=ForecastResponse)
async def post_forecast(req: ForecastRequest) -> ForecastResponse:
    # Wired up in Phase 4 (M3). For now we return 503 if no model exists
    # for the requested (workspace, metric) — this lets us deploy the
    # service ahead of the model runners without breaking the contract.
    ref = registry.latest(
        workspace_id=str(req.workspace_id),
        metric=req.metric,
        model_kind=req.model_kind,
    )
    if ref is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="no fitted model — retrain pending (M3)",
        )
    # Returning a response shape stub is misleading until M3 wires the runner;
    # if a model *does* exist we still 501 to make the gap obvious in CI.
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        detail="forecast inference lands in M3 (forecast/app/services/prophet_runner.py)",
    )


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
