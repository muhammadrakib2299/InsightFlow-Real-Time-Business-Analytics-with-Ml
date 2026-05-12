"""POST /anomaly — placeholder, fully implemented in M4."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from ..schemas import AnomalyRequest, AnomalyResponse

router = APIRouter(tags=["anomaly"])


@router.post("/anomaly", response_model=AnomalyResponse)
async def post_anomaly(_req: AnomalyRequest) -> AnomalyResponse:
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        detail="anomaly detection lands in M4 (forecast/app/services/anomaly.py)",
    )
