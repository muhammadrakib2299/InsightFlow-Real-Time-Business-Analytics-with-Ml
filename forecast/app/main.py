"""FastAPI entrypoint for the forecast service."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
from fastapi import FastAPI

from .routers import anomaly as anomaly_router
from .routers import forecast as forecast_router
from .routers import retrain as retrain_router
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
    log = structlog.get_logger("forecast")
    log.info("starting", env=settings.app_env, artifacts=settings.artifacts_dir)
    yield
    log.info("stopping")


app = FastAPI(
    title="InsightFlow Forecast",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url=None,
)

app.include_router(forecast_router.router)
app.include_router(retrain_router.router)
app.include_router(anomaly_router.router)


@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "forecast"}


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {"service": "insightflow-forecast", "version": "0.1.0"}
