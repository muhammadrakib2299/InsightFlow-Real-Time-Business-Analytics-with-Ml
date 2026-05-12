"""Kafka producer wrapper. Singleton across the FastAPI process."""

from __future__ import annotations

import asyncio
from typing import Any

import orjson
import structlog
from aiokafka import AIOKafkaProducer

from .settings import get_settings

logger = structlog.get_logger(__name__)


class Producer:
    _instance: "Producer | None" = None
    _lock = asyncio.Lock()

    def __init__(self) -> None:
        settings = get_settings()
        self._producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_bootstrap,
            value_serializer=lambda v: orjson.dumps(v),
            key_serializer=lambda k: k.encode("utf-8") if isinstance(k, str) else k,
            acks="all",
            enable_idempotence=True,
            compression_type="zstd",
            max_batch_size=131072,  # 128 KB
            linger_ms=20,
        )
        self._topic = settings.kafka_topic_events_raw
        self._started = False

    @classmethod
    async def get(cls) -> "Producer":
        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
                    await cls._instance.start()
        return cls._instance

    async def start(self) -> None:
        if not self._started:
            await self._producer.start()
            self._started = True
            logger.info("producer.started", topic=self._topic)

    async def stop(self) -> None:
        if self._started:
            await self._producer.stop()
            self._started = False
            logger.info("producer.stopped")

    async def send_event(self, workspace_id: str, event: dict[str, Any]) -> None:
        await self._producer.send_and_wait(
            self._topic,
            value=event,
            key=workspace_id,
        )

    async def send_batch(self, workspace_id: str, events: list[dict[str, Any]]) -> None:
        # Fan out to per-event sends so the producer can batch by partition;
        # send_and_wait on each is fine because the producer batches under the
        # hood with linger_ms.
        futures = [
            self._producer.send(self._topic, value=evt, key=workspace_id) for evt in events
        ]
        for fut in futures:
            await fut

    async def flush(self) -> None:
        await self._producer.flush()


async def close_producer() -> None:
    if Producer._instance is not None:
        await Producer._instance.stop()
        Producer._instance = None
