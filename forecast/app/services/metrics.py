"""Allowlist of metrics the forecast service knows how to aggregate.

Mirrors api/src/events/metrics.ts — keep them in lockstep when adding new
metrics. Lives in a constant rather than a config file so the BFF and
the forecast service ship the same set of names without a runtime
handshake.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


AggregationKind = Literal["sum_revenue", "count_events", "unique_users"]


@dataclass(frozen=True, slots=True)
class MetricDef:
    label: str
    event_name: str
    agg: AggregationKind
    unit: Literal["cents", "count", "users"]


METRICS: dict[str, MetricDef] = {
    "mrr": MetricDef("Monthly recurring revenue", "subscription_payment", "sum_revenue", "cents"),
    "dau": MetricDef("Daily active users", "session_start", "unique_users", "users"),
    "signups": MetricDef("Signups", "signup", "count_events", "count"),
    "churn": MetricDef("Churn events", "subscription_cancelled", "count_events", "count"),
    "payments": MetricDef("Payments", "subscription_payment", "count_events", "count"),
}


def is_known(name: str) -> bool:
    return name in METRICS


def resolve(name: str) -> MetricDef:
    if name not in METRICS:
        raise KeyError(f"unknown metric: {name}")
    return METRICS[name]
