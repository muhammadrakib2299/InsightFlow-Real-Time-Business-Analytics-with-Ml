# Data model

How an event travels from a client SDK to a chart in the dashboard, and
every place it gets shaped along the way.

## End-to-end flow

```
client SDK / REST
     │  EventIn  (Pydantic — flat properties enforced)
     ▼
ingestion FastAPI  ←─ POST /v1/events, X-Api-Key
     │  Kafka envelope (orjson) keyed by workspace_id
     ▼
Redpanda topic events.raw   (6 partitions, 7-day retention)
     │
     ▼
ingestion consumer worker
     │  enrich(geo, UA) → Map(String, String) properties
     ▼
ClickHouse events table     (ReplacingMergeTree on workspace_id, event_id)
     │  materialised views
     ▼
kpi_hourly   ┐
cohort_daily ┼── read-only facade views (v_kpi_hourly, v_cohort_daily)
funnel_step  ┘     │
                   ▼
       BFF (NestJS) ←─ withWorkspace() + Redis cache
                   │
                   ▼
       Next.js widgets
```

## 1. Client → ingestion

Source of truth: `ingestion/app/schemas.py` (Pydantic v2).

```python
class EventIn(BaseModel):
    event_id:     UUID                    # default: uuid4
    event_name:   str (1..128)
    user_id:      str (default '', max 256)
    session_id:   str (default '', max 128)
    occurred_at:  datetime | None
    properties:   dict[str, Any]          # flat only — nested raises 400
    revenue_cents: int >= 0
    currency:     str (max 8)
    country, city, device, os, browser:    str (low-cardinality)
    utm_source, utm_medium, utm_campaign,
    utm_term, utm_content:                 str (low-cardinality)
```

Constraints enforced at this boundary:

- `properties` values are stringified at the schema level. Nested dicts
  or arrays raise 400 — clients hoist nested keys to dot notation.
- `revenue_cents` is non-negative. Refund flows emit a separate
  `refund` event rather than negative revenue.
- Extra top-level fields are rejected (`model_config = ConfigDict(extra='forbid')`).

Source IP is NOT a field on `EventIn`. The ingestion API extracts it
from `X-Forwarded-For` and stuffs it into a private `_ingest.source_ip`
envelope used only for server-side geo enrichment — the IP itself is
never persisted to ClickHouse.

## 2. Ingestion → Kafka

The Kafka envelope is exactly the EventIn JSON plus the `_ingest`
envelope, serialized with orjson. Partition key = `workspace_id` (string
form) so per-tenant ordering is preserved across consumer rebalances.

Topic config: `infra/kafka/topics.yml`

| Topic | Partitions | Retention | Purpose |
|---|---|---|---|
| `events.raw` | 6 | 7 days | Raw event stream from ingestion |
| `events.tick` | 3 | 1 hour | Aggregated KPI deltas for WS fan-out |
| `alerts.fired` | 3 | 30 days | Triggered alert events for notifier workers |

## 3. Consumer → ClickHouse

Source: `ingestion/app/consumer.py` and `infra/clickhouse/init.sql`.

The consumer enriches `country/city` (MaxMind GeoLite2, fail-open) and
`device/os/browser` (ua-parser) ONLY if the client didn't supply them.
Then it inserts in micro-batches (1000 rows OR 1 second, whichever fires
first) into:

```sql
CREATE TABLE events (
  workspace_id   UUID,
  event_id       UUID,
  event_name     LowCardinality(String),
  user_id        String,
  session_id     String,
  occurred_at    DateTime64(3, 'UTC'),
  ingested_at    DateTime64(3, 'UTC') DEFAULT now64(),
  properties     Map(String, String),
  revenue_cents  Int64 DEFAULT 0,
  currency       LowCardinality(String),
  country        LowCardinality(String),
  city           LowCardinality(String),
  device         LowCardinality(String),
  os             LowCardinality(String),
  browser        LowCardinality(String),
  utm_source     LowCardinality(String),
  utm_medium     LowCardinality(String),
  utm_campaign   LowCardinality(String),
  utm_term       LowCardinality(String),
  utm_content    LowCardinality(String)
) ENGINE = ReplacingMergeTree(ingested_at)
ORDER BY (workspace_id, event_name, occurred_at, event_id)
PARTITION BY toYYYYMM(occurred_at)
TTL toDateTime(occurred_at) + INTERVAL 18 MONTH;
```

Why this shape:

- `workspace_id` first in ORDER BY → tenant queries hit the primary key
  prefix and the primary-key index is the per-tenant index.
- `event_id` last in ORDER BY → ReplacingMergeTree dedupes Kafka
  redeliveries (`(workspace_id, event_id)` is the idempotency key).
- `LowCardinality(String)` on every dimension keeps storage compact and
  point-equality fast.
- 18-month TTL drops whole partitions — no row-level deletes.
- `properties` as `Map(String, String)` lets clients evolve schemas
  without DDL.

## 4. Materialised views

```sql
mv_kpi_hourly        →  kpi_hourly        (AggregatingMergeTree)
mv_cohort_daily      →  cohort_daily      (AggregatingMergeTree)
                        funnel_step_daily (destination only — populated
                                            by per-funnel MVs at save time)
```

`kpi_hourly` keeps `countMerge`, `sumMerge`, `uniqMerge`-style
aggregate states per `(workspace_id, event_name, hour)`. The read-side
view `v_kpi_hourly` exposes the finalised counts. Rollups to day/week
are computed on read via `toStartOfDay(hour)` etc. — same MV powers
all granularities.

`cohort_daily` aggregates `(workspace_id, signup_day, activity_day)`
where `signup_day` is the user's earliest event. The BFF rolls weeks
on read for the heatmap.

## 5. BFF aggregation

Source: `api/src/events/`, `api/src/forecast/`.

Two contracts kept in deliberate sync with the forecast service:

| BFF allowlist (`api/src/events/metrics.ts`) | Forecast allowlist (`forecast/app/services/metrics.py`) |
|---|---|
| `mrr`, `dau`, `signups`, `churn`, `payments` | same |

Every query routes through `withWorkspace(workspaceId, fn)`. The wrapper
runtime-enforces `workspace_id = {workspace_id:UUID}` is present in the
SQL and overrides any caller-supplied `workspace_id` parameter (see
`api/src/common/with-workspace.ts`).

Cache layer:

- `kpi:{workspace_id}:{metric}:{granularity}:{from}:{to}` — 5 s TTL
- `cohort:{workspace_id}:{from}:{to}` — 60 s TTL
- `funnel:{workspace_id}:{windowHours}:{stepsCsv}:{from}:{to}` — 60 s TTL
- `forecast:{workspace_id}:{metric}:{model_kind}:{horizon}:{fitted_at}` — 24 h TTL

`fitted_at` in the forecast cache key means a retrain implicitly
invalidates the previous cache without an extra version counter.

## 6. Postgres application metadata

Source: `api/prisma/schema.prisma`.

Carries:

- `users` (bcrypt hash, display name, email verified flag)
- `workspaces` + `workspace_members` (`owner | member | viewer`)
- `api_keys` (`prefix`, argon2 `hash`, `scopes`, `revoked_at`)
- `dashboards` + `widgets`
- `alerts` + `alert_events`
- `share_links` (`token_hash`, `expires_at`, `revoked_at`)
- `pdf_jobs` (`queued | running | done | failed`)

The events themselves live in ClickHouse, not Postgres. Postgres is the
authoritative store for tenancy and configuration — everything else
flows from there.

## 7. Forecast artifacts

Source: `forecast/app/services/registry.py`.

```
forecast/artifacts/
  {workspace_id}/
    {metric}/
      {model_kind}__{iso_ts}.pkl          ← joblib dump (compress=3)
      {model_kind}__{iso_ts}.manifest.json
```

The manifest contains the SHA-256 of the artifact bytes, the metric
metadata, training window, and MAPE on the 14-day holdout. `load()`
recomputes the hash and refuses to deserialise if it doesn't match —
this stops a corrupted-or-replaced artifact from running inside the
forecast process.

## 8. Wire format the SDK ships

`sdk/src/types.ts` mirrors `EventIn` 1:1. The SDK enforces the same
flat-properties rule on the TypeScript side so a typo (`items: [{…}]`)
surfaces at compile time, not at the ingest 400.

Keep the three in lockstep:

- `ingestion/app/schemas.py`
- `sdk/src/types.ts`
- `docs/data-model.md` (this file)

The CI smoke test (`scripts/smoke.sh`) POSTs one event through every
layer and asserts it appears in ClickHouse — if you change the wire
format here, that test is the canary.
