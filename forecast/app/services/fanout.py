"""Enumerate (workspace_id, metric) pairs that need retraining.

The naive "every workspace × every metric" cross-product is fine for
the demo: a single workspace with 5 metrics, retraining in a few
minutes. For a production fleet we'd persist a "metrics in use" set
per workspace based on widget configs — that's filed under M3+
optimisations in plan.md.

For now we look at ClickHouse to find which workspaces have any
events at all and pair them with the static METRICS allowlist.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

import clickhouse_connect
import structlog

from ..settings import get_settings
from .metrics import METRICS

logger = structlog.get_logger(__name__)


@dataclass(slots=True)
class RetrainPair:
    workspace_id: str
    metric: str


def active_workspaces() -> list[str]:
    s = get_settings()
    client = clickhouse_connect.get_client(
        host=s.clickhouse_host,
        port=s.clickhouse_http_port,
        username=s.clickhouse_user,
        password=s.clickhouse_password,
        database=s.clickhouse_db,
        compress=True,
    )
    try:
        res = client.query(
            """
            SELECT DISTINCT workspace_id
            FROM kpi_hourly
            WHERE hour >= now() - INTERVAL 90 DAY
            """
        )
        rows = res.result_rows
    finally:
        client.close()
    return [str(r[0]) for r in rows]


def enumerate_pairs(workspace_id: str | None, metric: str | None) -> Iterator[RetrainPair]:
    if workspace_id and metric:
        yield RetrainPair(workspace_id, metric)
        return
    workspaces = [workspace_id] if workspace_id else active_workspaces()
    metrics = [metric] if metric else list(METRICS.keys())
    for ws in workspaces:
        for m in metrics:
            yield RetrainPair(ws, m)
