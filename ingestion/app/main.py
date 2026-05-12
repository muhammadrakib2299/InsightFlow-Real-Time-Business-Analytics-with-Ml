"""FastAPI entrypoint for the ingestion service."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI

from .auth import close_pool
from .ingest_api import router as ingest_router
from .producer import Producer, close_producer
from .rate_limit import close_limiter
from .settings import get_settings


def _configure_logging(level: str) -> None:
    logging.basicConfig(level=level.upper(), format="%(message)s")
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, level.upper())),
    )


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    _configure_logging(settings.log_level)
    log = structlog.get_logger("ingestion")
    log.info("starting", env=settings.app_env, kafka=settings.kafka_bootstrap)
    await Producer.get()
    try:
        yield
    finally:
        log.info("stopping")
        await close_producer()
        await close_limiter()
        await close_pool()


app = FastAPI(
    title="InsightFlow Ingestion",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.include_router(ingest_router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ingestion"}


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {"service": "insightflow-ingestion", "version": "0.1.0"}
