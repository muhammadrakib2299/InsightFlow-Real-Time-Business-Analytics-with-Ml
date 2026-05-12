"""POST /retrain — internal-only, fired by the GitHub Actions cron."""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, status

from ..schemas import RetrainRequest, RetrainResponse
from ..settings import get_settings

router = APIRouter(tags=["retrain"])


@router.post("/retrain", response_model=RetrainResponse)
async def post_retrain(
    req: RetrainRequest,
    x_retrain_secret: str = Header(default="", alias="X-Retrain-Secret"),
) -> RetrainResponse:
    settings = get_settings()
    if not x_retrain_secret or x_retrain_secret != settings.retrain_shared_secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "bad shared secret")
    # Real fan-out lands in M3: enumerate (workspace, metric) pairs and
    # enqueue jobs. For now we acknowledge the trigger so the cron passes
    # its smoke test.
    scope = "all" if req.workspace_id is None else str(req.workspace_id)
    metric = req.metric or "all"
    return RetrainResponse(
        queued=0,
        detail=f"retrain ack (scope={scope}, metric={metric}) — runner lands in M3",
    )
