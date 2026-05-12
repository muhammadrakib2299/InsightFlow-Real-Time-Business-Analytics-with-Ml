"""Kafka consumer → ClickHouse writer.

Pulls events.raw, enriches with geo/UA, and inserts into ClickHouse in
micro-batches. Idempotency on (workspace_id, event_id) is provided by
ReplacingMergeTree in the schema — re-processing offsets after a crash
will not double-count.

Run as a standalone process: `python -m app.consumer`.
"""

from __future__ import annotations

import asyncio
import logging
import signal
from contextlib import suppress
from datetime import datetime, timezone
from typing import Any

import clickhouse_connect
import orjson
import structlog
from aiokafka import AIOKafkaConsumer, TopicPartition

from .enrich import geo_lookup, ua_lookup
from .settings import get_settings

logger = structlog.get_logger(__name__)


BATCH_MAX_ROWS = 1000
BATCH_MAX_INTERVAL_S = 1.0

CH_COLUMNS = (
    "workspace_id",
    "event_id",
    "event_name",
    "user_id",
    "session_id",
    "occurred_at",
    "properties",
    "revenue_cents",
    "currency",
    "country",
    "city",
    "device",
    "os",
    "browser",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
)


def _parse_dt(raw: str | None) -> datetime:
    if not raw:
        return datetime.now(timezone.utc)
    try:
        # fromisoformat handles offsets in 3.11+
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _enrich_row(event: dict[str, Any]) -> tuple:
    ingest = event.get("_ingest") or {}
    ip = ingest.get("source_ip", "")
    ua = (event.get("properties") or {}).get("$user_agent", "") or ingest.get("user_agent", "")

    country, city = event.get("country", ""), event.get("city", "")
    if not country:
        country, city2 = geo_lookup(ip)
        if not city:
            city = city2

    device, os_, browser = event.get("device", ""), event.get("os", ""), event.get("browser", "")
    if not (device and os_ and browser):
        d2, o2, b2 = ua_lookup(ua)
        device = device or d2
        os_ = os_ or o2
        browser = browser or b2

    properties = {str(k): "" if v is None else str(v) for k, v in (event.get("properties") or {}).items()}

    return (
        event["workspace_id"],
        event["event_id"],
        event["event_name"],
        event.get("user_id", "") or "",
        event.get("session_id", "") or "",
        _parse_dt(event.get("occurred_at")),
        properties,
        int(event.get("revenue_cents") or 0),
        event.get("currency", "") or "",
        country,
        city,
        device,
        os_,
        browser,
        event.get("utm_source", "") or "",
        event.get("utm_medium", "") or "",
        event.get("utm_campaign", "") or "",
        event.get("utm_term", "") or "",
        event.get("utm_content", "") or "",
    )


class ConsumerWorker:
    def __init__(self) -> None:
        s = get_settings()
        self._consumer = AIOKafkaConsumer(
            s.kafka_topic_events_raw,
            bootstrap_servers=s.kafka_bootstrap,
            group_id=s.kafka_consumer_group,
            auto_offset_reset="earliest",
            enable_auto_commit=False,
            value_deserializer=lambda b: orjson.loads(b),
            max_poll_records=BATCH_MAX_ROWS,
        )
        self._ch = clickhouse_connect.get_client(
            host=s.clickhouse_host,
            port=s.clickhouse_http_port,
            username=s.clickhouse_user,
            password=s.clickhouse_password,
            database=s.clickhouse_db,
            compress=True,
            send_receive_timeout=30,
        )
        self._buffer: list[tuple] = []
        self._pending_partitions: dict[TopicPartition, int] = {}
        self._stop = asyncio.Event()
        self._last_flush_at = asyncio.get_event_loop().time()

    async def _flush(self) -> None:
        if not self._buffer:
            return
        rows = self._buffer
        self._buffer = []
        try:
            self._ch.insert(
                "events",
                rows,
                column_names=CH_COLUMNS,
            )
        except Exception:
            # Put the buffer back so the next loop retries; do not commit
            # offsets if the insert failed.
            self._buffer = rows + self._buffer
            logger.exception("consumer.insert_failed", count=len(rows))
            raise

        # Commit the highest offset seen per partition
        if self._pending_partitions:
            offsets = {tp: off + 1 for tp, off in self._pending_partitions.items()}
            await self._consumer.commit(offsets=offsets)
            self._pending_partitions.clear()
        self._last_flush_at = asyncio.get_event_loop().time()
        logger.info("consumer.flushed", rows=len(rows))

    def _request_stop(self) -> None:
        logger.info("consumer.stop_requested")
        self._stop.set()

    async def run(self) -> None:
        await self._consumer.start()
        logger.info("consumer.started", topic=self._consumer._client.cluster.topics())  # type: ignore[attr-defined]
        try:
            while not self._stop.is_set():
                # Poll with a short timeout so we can honor the flush interval
                batches = await self._consumer.getmany(timeout_ms=500, max_records=BATCH_MAX_ROWS)
                for tp, messages in batches.items():
                    for msg in messages:
                        try:
                            row = _enrich_row(msg.value)
                        except Exception:
                            logger.exception("consumer.malformed_event", offset=msg.offset)
                            continue
                        self._buffer.append(row)
                        self._pending_partitions[tp] = msg.offset

                now = asyncio.get_event_loop().time()
                should_flush = (
                    len(self._buffer) >= BATCH_MAX_ROWS
                    or (self._buffer and now - self._last_flush_at >= BATCH_MAX_INTERVAL_S)
                )
                if should_flush:
                    await self._flush()
        finally:
            with suppress(Exception):
                await self._flush()
            await self._consumer.stop()
            self._ch.close()
            logger.info("consumer.stopped")


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
    )
    worker = ConsumerWorker()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, worker._request_stop)
        except NotImplementedError:
            # Windows
            signal.signal(sig, lambda *_: worker._request_stop())
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
