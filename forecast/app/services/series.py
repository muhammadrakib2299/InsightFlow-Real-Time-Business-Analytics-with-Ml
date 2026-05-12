"""Pull daily-aggregated series from ClickHouse for forecasting.

We pre-aggregate to daily because Prophet doesn't need sub-daily
resolution to learn weekly/yearly seasonality, and dropping to daily
keeps fit time bounded on a small VPS. ClickHouse already maintains
hourly merge-aggregates in `kpi_hourly` — we sum those into days.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import clickhouse_connect
import pandas as pd
import structlog

from ..settings import get_settings
from .metrics import MetricDef

logger = structlog.get_logger(__name__)


@dataclass(slots=True)
class DailySeries:
    """A (ds, y) frame ready for Prophet — sorted ascending."""

    df: pd.DataFrame
    workspace_id: str
    metric: str
    earliest: date
    latest: date


def _agg_select(agg: str) -> str:
    if agg == "sum_revenue":
        return "toFloat64(sumMerge(revenue_cents))"
    if agg == "count_events":
        return "toFloat64(countMerge(event_count))"
    if agg == "unique_users":
        return "toFloat64(uniqMerge(unique_users))"
    raise ValueError(f"unknown agg kind: {agg}")


def fetch_daily(
    workspace_id: str,
    metric_name: str,
    metric_def: MetricDef,
    *,
    train_window_days: int | None = None,
    end: datetime | None = None,
) -> DailySeries:
    """Fetch a daily series for (workspace_id, event_name).

    Always filters by workspace_id as the first column — the tenant
    isolation contract from ADR-005 is enforced inside this function so
    callers cannot accidentally drop it.
    """
    settings = get_settings()
    end = end or datetime.now(timezone.utc)
    end = end.replace(hour=0, minute=0, second=0, microsecond=0)
    train_window_days = train_window_days or settings.train_window_days
    start = end - timedelta(days=train_window_days)

    client = clickhouse_connect.get_client(
        host=settings.clickhouse_host,
        port=settings.clickhouse_http_port,
        username=settings.clickhouse_user,
        password=settings.clickhouse_password,
        database=settings.clickhouse_db,
        compress=True,
    )
    try:
        sql = f"""
            SELECT
                toDate(hour) AS ds,
                {_agg_select(metric_def.agg)} AS y
            FROM kpi_hourly
            WHERE workspace_id = {{workspace_id:UUID}}
              AND event_name   = {{event_name:String}}
              AND hour >= {{start:DateTime}}
              AND hour <  {{end:DateTime}}
            GROUP BY ds
            ORDER BY ds
        """
        result = client.query(
            sql,
            parameters={
                "workspace_id": workspace_id,
                "event_name": metric_def.event_name,
                "start": start.strftime("%Y-%m-%d %H:%M:%S"),
                "end": end.strftime("%Y-%m-%d %H:%M:%S"),
            },
        )
        rows = result.result_rows
    finally:
        client.close()

    if not rows:
        df = pd.DataFrame({"ds": pd.to_datetime([]), "y": pd.Series(dtype="float64")})
        earliest = end.date()
        latest = end.date()
    else:
        df = pd.DataFrame(rows, columns=["ds", "y"])
        df["ds"] = pd.to_datetime(df["ds"])
        df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0.0)
        # Fill missing days with 0 so seasonality fits cleanly
        full_range = pd.date_range(df["ds"].min(), df["ds"].max(), freq="D")
        df = df.set_index("ds").reindex(full_range, fill_value=0.0).rename_axis("ds").reset_index()
        df = df.sort_values("ds").reset_index(drop=True)
        earliest = df["ds"].min().date()
        latest = df["ds"].max().date()

    logger.info(
        "series.fetched",
        workspace_id=workspace_id,
        metric=metric_name,
        rows=len(df),
        earliest=str(earliest),
        latest=str(latest),
    )
    return DailySeries(df=df, workspace_id=workspace_id, metric=metric_name, earliest=earliest, latest=latest)
