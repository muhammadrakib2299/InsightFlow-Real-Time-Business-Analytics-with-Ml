# ADR-001 — ClickHouse over TimescaleDB

- **Status:** Accepted
- **Date:** 2026-05-12
- **Deciders:** Md. Rakib
- **Supersedes:** —
- **Superseded by:** —

## Context

InsightFlow's primary read pattern is `GROUP BY day|hour, segment` over an event stream that we expect to grow into the hundreds of millions of rows. Every KPI tile, cohort heatmap, and funnel widget rolls up the same `events` table. The dashboard target is sub-second p95 read latency on a single VPS (Hetzner CX22, 4 GB RAM).

The two realistic open-source options were **ClickHouse** and **TimescaleDB** (Postgres extension). Both can store time-series, both support continuous aggregates / materialized views, both are MIT-friendly (ClickHouse is Apache 2.0, Timescale License is mixed — open-source TSL excludes hosted competition but is fine for self-hosters).

## Decision

We use **ClickHouse** for the event store and pre-aggregated materialized views (`mv_kpi_hourly`, `mv_cohort_daily`, `mv_funnel_step_daily`). Postgres stays in the stack for application metadata only (users, workspaces, dashboards, alerts).

## Why

- **Columnar compression.** Event payloads compress 8–15× in ClickHouse versus row-store Postgres, which directly determines how much history we can keep on a 4 GB box.
- **Aggregation throughput.** ClickHouse's vectorised execution makes `GROUP BY` over hundreds of millions of rows fast enough that we don't have to precompute every possible drill-down — the materialized views are an optimisation, not a requirement.
- **Materialized views are first-class.** ClickHouse materialized views are append-time triggers writing to a separate `MergeTree` table — no row-level updates, no vacuum lag. TimescaleDB's continuous aggregates work but lean on the standard Postgres autovacuum / WAL story, which we'd rather not tune on a small VPS.
- **No row-level updates ever needed.** We never update events post-ingest. `ReplacingMergeTree` on `(workspace_id, event_id)` gives us idempotency on Kafka offset replay, which is enough.

## Trade-offs

- **Worse ad-hoc joins.** ClickHouse joins are second-class. We pay for this by denormalising at write-time (event row carries `country`, `device`, `utm_*` etc. as `LowCardinality(String)` rather than joining to dimension tables).
- **Unfamiliar operational profile.** ClickHouse's merge/part model, `OPTIMIZE`, and TTL semantics are different from Postgres. Mitigated by ADR-005's choice to put `workspace_id` first in the ORDER BY of every table, which makes the merge story predictable.
- **No row-level updates.** Acceptable — we don't need them.

## Consequences

- ClickHouse `init.sql` is the source of truth for the event schema; the SDK and ingestion Pydantic schemas must conform to it.
- Schema migrations are additive-only (column adds, materialized view rebuilds via `CREATE MATERIALIZED VIEW ... POPULATE`).
- The `withWorkspace()` helper in NestJS (ADR-005) is the only allowed gateway to ClickHouse data from the API layer.
