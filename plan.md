# InsightFlow — Build Plan

> Target: ship a public live demo + GitHub repo before German DS Master's application (Aug 2026). MalVis is already live; InsightFlow is portfolio piece #2, aimed squarely at Data Engineer + AI Engineer roles.

---

## North-star scope (v1)

A self-hostable, multi-tenant BI platform that:

1. Ingests events in real time via SDK / REST / webhook → Kafka → ClickHouse
2. Renders sub-second KPI dashboards with drill-down, cohort, and funnel views
3. Auto-forecasts revenue / churn / demand with Prophet (and ARIMA as a baseline) on nightly retrains
4. Detects anomalies on rolling windows via Z-score and IQR, alerts via email / Slack / webhook
5. Exports branded PDF reports in one click
6. Runs end-to-end on a single VPS via `docker compose up`

Out of scope for v1: SQL editor / ad-hoc query UI, custom-metric DSL, BYO-warehouse adapters, mobile app, RBAC beyond owner / member / viewer.

---

## Architecture

```
┌──────────────┐    ┌────────┐    ┌──────────────┐    ┌────────────┐
│ Event sources│───►│ Kafka  │───►│ Stream worker│───►│ ClickHouse │
│ SDK / REST / │    │ topics │    │  (Python)    │    │   (OLAP)   │
│ Webhooks     │    └────────┘    └──────────────┘    └─────┬──────┘
└──────────────┘                                            │
                                                            │
┌──────────────┐   ┌────────────────┐   ┌────────────────┐  │
│ Next.js UI   │◄─►│ NestJS API     │◄─►│ Forecast svc   │◄─┘
│ (Recharts +  │   │ (BFF, auth,    │   │ FastAPI +      │
│  WebSocket)  │   │  dashboards,   │   │ Prophet/ARIMA  │
│              │   │  PDF export)   │   │ + anomaly det. │
└──────────────┘   └───────┬────────┘   └────────────────┘
                           │
              ┌────────────┼─────────────┐
              ▼                          ▼
         ┌──────────┐              ┌──────────┐
         │ Postgres │              │  Redis   │
         │ (meta)   │              │ (cache + │
         └──────────┘              │  pubsub) │
                                   └──────────┘
```

### Service responsibilities

| Service | Stack | Responsibility |
|---|---|---|
| `frontend` | Next.js 14, TS, Tailwind, Recharts | Dashboard UI, cohort / funnel views, PDF export trigger, live updates via WebSocket |
| `api` | NestJS 10, Prisma, Postgres | Auth, workspaces, dashboard CRUD, alert config, signed share links, PDF rendering, BFF aggregation queries to ClickHouse |
| `ingestion` | Python 3.11, aiokafka, FastAPI | REST `/v1/events` ingest, webhook receivers, Kafka producer; consumer that writes to ClickHouse in 1-second micro-batches |
| `forecast` | Python 3.11, FastAPI, Prophet, statsmodels | `/forecast`, `/anomaly`, `/retrain` endpoints; nightly retrain cron; model registry |
| `clickhouse` | ClickHouse 24 | Event store + materialized views for KPIs, cohorts, funnels |
| `postgres` | Postgres 16 | Application metadata: users, workspaces, dashboards, widgets, alerts |
| `redis` | Redis 7 | Aggregation cache, WebSocket pub/sub, Bull queues |
| `caddy` | Caddy 2 | TLS, rate limits, reverse proxy |

### Data flow — write path

1. Client SDK or webhook posts to `ingestion` REST endpoint (validated against Pydantic schema, API key checked).
2. `ingestion` produces to Kafka topic `events.raw` (partition key = `workspace_id` for ordering per tenant).
3. Stream worker consumes `events.raw`, enriches (geo from IP, device parse from UA), and inserts into ClickHouse `events` table in 1-second micro-batches with idempotency key = `(workspace_id, event_id)`.
4. ClickHouse materialized views maintain pre-aggregated tables: `mv_kpi_hourly`, `mv_cohort_daily`, `mv_funnel_step_daily`.
5. WebSocket bridge subscribes to a thin "metrics tick" topic (`events.tick`) for live UI updates — never streams raw events to the frontend.

### Data flow — read path

1. Frontend asks `api` for a dashboard payload.
2. `api` resolves widget definitions, hits Redis cache (5-second TTL on KPI tiles, 60-second on cohorts/funnels).
3. On miss, `api` runs parameterised SQL against ClickHouse materialised views and back-fills cache.
4. For forecast tiles, `api` calls `forecast` service — which serves from a pre-computed nightly forecast in Redis, falling back to on-demand inference if cache is empty.

---

## Key design decisions (ADRs)

### ADR-001 — ClickHouse over TimescaleDB

**Why ClickHouse.** Event volume is the bottleneck, not joins. ClickHouse columnar compression + materialized views give us sub-second aggregation over hundreds of millions of rows on commodity hardware. TimescaleDB's hypertables are simpler operationally but degrade past ~50M rows per chunk for the kind of `GROUP BY day, segment` queries dashboards need.

**Trade-off.** Worse ad-hoc joins, no row-level updates (we never update events anyway), unfamiliar operational profile. Acceptable.

### ADR-002 — Kafka over Redis Streams

**Why Kafka.** Replayability is non-negotiable: when we add a new materialized view or fix a bug in the enrichment pipeline, we want to re-process from offset 0 without re-asking customers to send the events again. Redis Streams does have replay but persistence semantics are weaker and the operational story past a single node is rough.

**Trade-off.** Kafka is heavier to operate. Mitigated in v1 by using a single-broker setup via Redpanda or `bitnami/kafka` (Kraft mode, no Zookeeper).

### ADR-003 — Prophet primary, ARIMA baseline

**Why Prophet.** Handles multi-seasonality (weekly + yearly) and holidays out of the box, robust to missing data, fast to retrain. Crucially, it produces calibrated uncertainty intervals — which we need to render as the shaded forecast band on every KPI tile.

**Why also ARIMA.** Two purposes: (a) baseline accuracy comparison shown in the model card, demonstrating we're not just calling a magic library; (b) fallback when Prophet fails on extremely sparse series.

**Trade-off.** Prophet has been somewhat deprecated by Meta — but it still works, and re-training cost is trivial. We'll add NeuralProphet as v2 if metrics warrant.

### ADR-004 — NestJS BFF, FastAPI for ML

**Why two backends.** Splitting the dashboard CRUD / auth concerns (NestJS, plays to existing Combosoft expertise) from the ML inference concerns (FastAPI, Python ecosystem for Prophet / statsmodels) is faster to build than forcing one stack to do both. The boundary is a thin internal HTTP contract — easy to merge later if needed.

**Trade-off.** Two services to deploy, two CI pipelines. Acceptable given the velocity gain.

### ADR-005 — Multi-tenant via row-level workspace_id

**Why.** Schema-per-tenant scales poorly past ~50 tenants in ClickHouse (one materialized view per workspace). Row-level isolation with `workspace_id` as the first clustering column gives near-identical query performance with one materialized view shared across tenants.

**Trade-off.** Application-layer enforcement is required: every query must filter by `workspace_id`. Mitigated by a single shared `withWorkspace()` helper in NestJS that all dashboard queries route through, plus integration tests asserting cross-tenant data leakage is impossible.

---

## Data model (sketch)

### ClickHouse — `events` (raw)

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
  currency       LowCardinality(String) DEFAULT '',
  country        LowCardinality(String),
  device         LowCardinality(String),
  utm_source     LowCardinality(String),
  utm_medium     LowCardinality(String),
  utm_campaign   LowCardinality(String)
) ENGINE = ReplacingMergeTree(ingested_at)
ORDER BY (workspace_id, event_name, occurred_at, event_id)
PARTITION BY toYYYYMM(occurred_at)
TTL occurred_at + INTERVAL 18 MONTH;
```

`ReplacingMergeTree` gives us idempotency on `(workspace_id, event_id)` — re-processing Kafka offsets is safe.

### Postgres — application metadata

- `users (id, email, password_hash, created_at)`
- `workspaces (id, name, owner_id, created_at)`
- `workspace_members (workspace_id, user_id, role)` — `owner | member | viewer`
- `api_keys (id, workspace_id, prefix, hash, created_at, revoked_at)`
- `dashboards (id, workspace_id, name, layout_json, created_by, updated_at)`
- `widgets (id, dashboard_id, type, config_json, position)`
- `alerts (id, workspace_id, metric, threshold_method, threshold_params, channels_json, enabled)`
- `share_links (id, dashboard_id, token_hash, expires_at, created_by)`

Full schema in `docs/data-model.md` (to be authored in Phase 1).

---

## Milestones

| Milestone | Calendar | Definition of done |
|---|---|---|
| **M0 — Decisions locked** | Day 1 | ADRs 001–005 written; `.env.example` committed; container images pinned |
| **M1 — Skeleton + ingestion** | Days 2–4 | `docker compose up` brings up Kafka, ClickHouse, Postgres, Redis; `/v1/events` accepts a payload that lands in ClickHouse end-to-end |
| **M2 — Dashboard MVP** | Days 5–9 | Auth, workspace, single dashboard with one KPI tile reading from ClickHouse, live update via WebSocket |
| **M3 — Forecasting** | Days 10–13 | Prophet retrain cron working on seeded data; KPI tiles render forecast band; ARIMA comparison in model card |
| **M4 — Anomaly + alerts** | Days 14–15 | Z-score + IQR detector running on hourly rollup; email + Slack alerts firing |
| **M5 — Cohort, funnel, PDF** | Days 16–18 | Cohort heatmap, funnel widget, one-click PDF export shipping |
| **M6 — Hardening + deploy** | Days 19–21 | Rate limits, CORS, signed share links, load test (k6) at 1k events/s sustained, Caddy + TLS, live URL |
| **M7 — Docs + demo video** | Day 22 | README screenshots, 2-minute demo video, ADRs published, `lessons.md` written |

Total target: 22 calendar days of focused work. Slip budget: 1 week.

---

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Kafka ops complexity eats a week | Medium | High | Use Redpanda single-node in dev/demo; document upgrade path to multi-broker but don't ship it |
| Prophet retrain takes minutes on real data | Medium | Medium | Cap training window to 18 months; pre-aggregate to daily before fitting; benchmark in M3 day 1 |
| Multi-tenant row-level isolation bug | Low | Critical | Centralised `withWorkspace()` helper + 3 integration tests that explicitly attempt cross-tenant reads and assert empty results |
| Free-tier hosting can't run ClickHouse + Kafka | High | High | Demo runs on a $20/month Hetzner CX22 (4 GB RAM is enough for the seeded demo dataset) — budget this from day 0, not as an afterthought |
| Scope creep into "build my own Mixpanel" | High | Medium | The "Out of scope for v1" list at the top is the gate; new features get filed in `todo.md` under "v2" |

---

## Success criteria (for the portfolio readers, not just for shipping)

A reviewer (admissions committee, hiring manager) opening the repo should within 5 minutes be able to:

1. **Understand what it does** — README hero + one screenshot answers it
2. **See it run** — single `docker compose up` works on their machine
3. **Read the design reasoning** — `docs/ADR-*.md` files exist and are concise
4. **Trace one event end-to-end** — `docs/data-model.md` shows SDK → Kafka → ClickHouse → dashboard
5. **See the ML actually working** — a screenshot of a forecast band over real seeded data, not a static mock

If any of those five things are missing on submission day, the project is incomplete regardless of feature count.
