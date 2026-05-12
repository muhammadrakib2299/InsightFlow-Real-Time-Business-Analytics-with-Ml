"""POST /anomaly — full implementation (M4)."""

from __future__ import annotations

import structlog
from fastapi import APIRouter, HTTPException, status

from ..schemas import AnomalyPoint, AnomalyRequest, AnomalyResponse
from ..services import anomaly as anomaly_service
from ..services.metrics import is_known, resolve
from ..services.series import fetch_daily

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["anomaly"])


@router.post("/anomaly", response_model=AnomalyResponse)
async def post_anomaly(req: AnomalyRequest) -> AnomalyResponse:
    if not is_known(req.metric):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown metric: {req.metric}")
    metric_def = resolve(req.metric)
    series = fetch_daily(str(req.workspace_id), req.metric, metric_def, train_window_days=180)

    if req.method == "zscore":
        results = anomaly_service.zscore_detect(
            series.df, window_days=req.window_days, threshold=req.threshold
        )
    elif req.method == "iqr":
        results = anomaly_service.iqr_detect(
            series.df, window_days=req.window_days, multiplier=req.threshold
        )
    else:  # pragma: no cover — schema constrains this
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"unknown method: {req.method}")

    points = [
        AnomalyPoint(ds=r.ds, value=r.value, expected=r.expected, is_anomaly=r.is_anomaly)
        for r in results
    ]
    flagged = sum(1 for p in points if p.is_anomaly)
    logger.info(
        "anomaly.evaluated",
        workspace_id=str(req.workspace_id),
        metric=req.metric,
        method=req.method,
        flagged=flagged,
        points=len(points),
    )
    return AnomalyResponse(
        workspace_id=req.workspace_id,
        metric=req.metric,
        method=req.method,
        points=points,
    )
