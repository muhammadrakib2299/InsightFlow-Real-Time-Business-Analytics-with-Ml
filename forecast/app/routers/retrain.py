"""POST /retrain — internal-only, fired by the GitHub Actions cron.

Fans out to (workspace_id, metric) pairs, fits both Prophet and ARIMA,
persists via the registry. Errors per-pair are logged and counted but
do not abort the run — the cron should succeed overall and we'll see
the dropped metrics in /models.
"""

from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, Header, HTTPException, status

from ..schemas import RetrainRequest, RetrainResponse
from ..services import arima_runner, prophet_runner
from ..services.fanout import RetrainPair, enumerate_pairs
from ..settings import get_settings

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["retrain"])


def _retrain_pair(pair: RetrainPair) -> tuple[bool, bool, str | None]:
    """Run both runners for a single (workspace, metric). Returns
    (prophet_ok, arima_ok, error_summary)."""
    prophet_ok = False
    arima_ok = False
    errors: list[str] = []

    try:
        prophet_runner.fit_and_persist(pair.workspace_id, pair.metric)
        prophet_ok = True
    except Exception as exc:  # noqa: BLE001
        errors.append(f"prophet: {exc}")
        logger.warning(
            "retrain.prophet_failed",
            workspace_id=pair.workspace_id,
            metric=pair.metric,
            error=str(exc),
        )

    try:
        arima_runner.fit_and_persist(pair.workspace_id, pair.metric)
        arima_ok = True
    except Exception as exc:  # noqa: BLE001
        errors.append(f"arima: {exc}")
        logger.warning(
            "retrain.arima_failed",
            workspace_id=pair.workspace_id,
            metric=pair.metric,
            error=str(exc),
        )

    return prophet_ok, arima_ok, "; ".join(errors) if errors else None


@router.post("/retrain", response_model=RetrainResponse)
async def post_retrain(
    req: RetrainRequest,
    x_retrain_secret: str = Header(default="", alias="X-Retrain-Secret"),
) -> RetrainResponse:
    settings = get_settings()
    if not x_retrain_secret or x_retrain_secret != settings.retrain_shared_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad shared secret")

    workspace_id = str(req.workspace_id) if req.workspace_id else None
    metric = req.metric

    pairs = list(enumerate_pairs(workspace_id, metric))
    if not pairs:
        return RetrainResponse(queued=0, detail="no active workspaces or metrics to retrain")

    loop = asyncio.get_running_loop()
    results = await asyncio.gather(
        *(loop.run_in_executor(None, _retrain_pair, p) for p in pairs)
    )

    fits_ok = sum(1 for prophet_ok, _, _ in results if prophet_ok) + sum(
        1 for _, arima_ok, _ in results if arima_ok
    )
    failures = [
        (pair, err) for pair, (_, _, err) in zip(pairs, results) if err is not None
    ]

    detail_parts = [f"pairs={len(pairs)}", f"models_fit={fits_ok}"]
    if failures:
        detail_parts.append(f"failures={len(failures)}")
        # Surface the first few errors so cron logs are usable
        sample = "; ".join(f"{p.workspace_id}/{p.metric}: {err}" for p, err in failures[:3])
        detail_parts.append(f"sample=[{sample}]")
    logger.info(
        "retrain.done", pairs=len(pairs), fits_ok=fits_ok, failures=len(failures)
    )
    return RetrainResponse(queued=fits_ok, detail=" ".join(detail_parts))
