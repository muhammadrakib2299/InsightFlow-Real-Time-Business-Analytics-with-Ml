"""POST /v1/events — single + batch ingest."""

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from .auth import ApiKeyContext, require_api_key
from .producer import Producer
from .rate_limit import get_limiter
from .schemas import BatchIn, EventIn, IngestAck
from .settings import get_settings

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/v1", tags=["ingest"])


def _to_kafka_payload(evt: EventIn, ctx: ApiKeyContext) -> dict[str, object]:
    occurred_at = evt.occurred_at or datetime.now(timezone.utc)
    if occurred_at.tzinfo is None:
        occurred_at = occurred_at.replace(tzinfo=timezone.utc)
    return {
        "workspace_id": ctx.workspace_id,
        "event_id": str(evt.event_id),
        "event_name": evt.event_name,
        "user_id": evt.user_id,
        "session_id": evt.session_id,
        "occurred_at": occurred_at.isoformat(),
        "properties": evt.properties,
        "revenue_cents": evt.revenue_cents,
        "currency": evt.currency,
        "country": evt.country,
        "city": evt.city,
        "device": evt.device,
        "os": evt.os,
        "browser": evt.browser,
        "utm_source": evt.utm_source,
        "utm_medium": evt.utm_medium,
        "utm_campaign": evt.utm_campaign,
        "utm_term": evt.utm_term,
        "utm_content": evt.utm_content,
        # Forwarded so the consumer can do IP-based geo enrichment.
        # The IP itself is never persisted in ClickHouse.
        "_ingest": {
            "received_at": datetime.now(timezone.utc).isoformat(),
        },
    }


async def _enforce_rate_limit(ctx: ApiKeyContext, cost: int) -> None:
    allowed, _remaining = await get_limiter().consume(ctx.key_id, cost=cost)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="rate limit exceeded",
            headers={"Retry-After": "1"},
        )


@router.post("/events", response_model=IngestAck, status_code=status.HTTP_202_ACCEPTED)
async def post_event(
    payload: EventIn | BatchIn,
    request: Request,
    ctx: ApiKeyContext = Depends(require_api_key),
) -> IngestAck:
    settings = get_settings()
    events = payload.events if isinstance(payload, BatchIn) else [payload]
    await _enforce_rate_limit(ctx, cost=len(events))

    # Stamp the source IP onto each event's _ingest so the consumer can do
    # geo enrichment without re-parsing headers. Caddy forwards via
    # X-Forwarded-For; uvicorn already trusts the proxy via --forwarded-allow-ips
    # (set in compose).
    source_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "")
    )

    producer = await Producer.get()
    kafka_events: list[dict[str, object]] = []
    for evt in events:
        payload_kafka = _to_kafka_payload(evt, ctx)
        if source_ip:
            payload_kafka["_ingest"]["source_ip"] = source_ip  # type: ignore[index]
        kafka_events.append(payload_kafka)

    if len(kafka_events) == 1:
        await producer.send_event(ctx.workspace_id, kafka_events[0])
    else:
        await producer.send_batch(ctx.workspace_id, kafka_events)

    logger.info(
        "ingest.accepted",
        workspace_id=ctx.workspace_id,
        count=len(kafka_events),
        key_prefix=ctx.prefix,
    )
    return IngestAck(
        accepted=len(kafka_events),
        workspace_id=ctx.workspace_id,
        queued_to=settings.kafka_topic_events_raw,
    )
