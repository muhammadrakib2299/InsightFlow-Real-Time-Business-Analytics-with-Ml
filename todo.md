# InsightFlow — Build TODO

> Target ship date: ~3 weeks from start. Live URL + demo video before German DS Master's application (Aug 2026). Slip budget: 1 week.

Legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Decisions to make first

- [x] **Demo dataset shape** — **SaaS subscriptions** (MRR / churn / ARPU / DAU). Locked 2026-05-12 for the strongest forecasting story; e-commerce parked for v2.
- [x] **Hosting** — single **Hetzner CX22** (4 GB / 2 vCPU / ~$5/mo) running the whole stack via Caddy + docker-compose. Credit availability to confirm before M6.
- [ ] **Domain name** — deferred 2026-05-12. Candidates: `insightflow.dev` or `tryinsightflow.com`. Must be registered before M6 so TLS issuance has time.
- [x] **Auth provider** — **email/password via NestJS + bcrypt**, magic-link as v2. No Auth0 (cost + lock-in for a portfolio piece).
- [x] **Kafka distribution** — **Redpanda** (single binary, KRaft mode, no Zookeeper) for dev/demo; Apache Kafka documented as production path in ADR-002.
- [x] **Email provider for alerts** — **Resend** (clean API, generous free tier).
- [x] **Forecast cadence** — nightly retrain at **02:00 UTC**; training window capped to **18 months**; forecasts served from Redis with **24 h TTL**.
- [x] **Multi-tenant row-key choice** — **`workspace_id` as first ORDER BY column** in every ClickHouse table. To be documented in ADR-005 before any schema is written.

---

## Phase 1 — Repo + skeleton (Day 1)

- [ ] `git init`, add `.gitignore` (Node, Python, models, .env, dist, .next, __pycache__, *.pyc, *.log)
- [ ] Add MIT `LICENSE`
- [ ] Add root `package.json` with npm workspaces (`api`, `frontend`, `sdk`)
- [ ] Add `pyproject.toml` at root with shared ruff + black config; per-service `requirements.txt` for `ingestion/` and `forecast/`
- [ ] Create folder structure:
  ```
  api/                  NestJS — auth, dashboards, alerts, PDF export
    src/
      main.ts
      app.module.ts
      auth/             controllers, guards, jwt strategy
      workspaces/
      dashboards/
      alerts/
      events/           BFF aggregation queries to ClickHouse
      forecast/         BFF wrapper around forecast service
      pdf/              Puppeteer renderer
      common/           prisma service, redis service, clickhouse service
    prisma/schema.prisma
    test/
    Dockerfile
    package.json
  ingestion/            Python — REST ingest + Kafka → ClickHouse worker
    app/
      main.py
      ingest_api.py     FastAPI for /v1/events
      consumer.py       Kafka consumer → ClickHouse writer
      enrich.py         geo / UA enrichment
      schemas.py        pydantic
    tests/
    Dockerfile
    requirements.txt
  forecast/             Python — Prophet, ARIMA, anomaly detection
    app/
      main.py
      routers/          forecast.py, anomaly.py, retrain.py
      services/         prophet_runner.py, arima_runner.py, anomaly.py, registry.py
      schemas/
    tests/
    Dockerfile
    requirements.txt
  frontend/             Next.js 14 dashboard
    app/
    components/
      widgets/          KpiTile, CohortHeatmap, FunnelChart, ForecastBand
      charts/           Recharts wrappers
      layout/
    lib/                api client, websocket client
    package.json
  sdk/                  insightflow-js
    src/
      client.ts
      types.ts
    package.json
  infra/
    docker-compose.yml
    docker-compose.dev.yml      bind-mounts for hot reload
    clickhouse/
      init.sql                  schema + materialized views
      migrations/
    kafka/
      topics.yml
    caddy/
      Caddyfile
    grafana/                    optional, for self-monitoring
  scripts/
    seed_demo.py                90 days of synthetic SaaS events
    load_gen.py                 k6 / locust load generator
    retrain_cron.sh
  docs/
    architecture.md
    data-model.md
    ADR-001-clickhouse-vs-timescale.md
    ADR-002-kafka-vs-redis-streams.md
    ADR-003-forecast-model-choice.md
    ADR-004-nestjs-bff-fastapi-ml.md
    ADR-005-multitenant-row-level.md
  tests/                e2e (Playwright) + load (k6)
  .github/workflows/
    ci.yml
    retrain.yml
  README.md
  plan.md
  todo.md
  CONTRIBUTING.md
  CODE_OF_CONDUCT.md
  SECURITY.md
  .env.example
  ```
- [ ] Author all five ADR stubs (one paragraph each is fine; expand as decisions land)
- [ ] Add `.env.example` listing every var consumed across services
- [x] Add `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, drop-in)
- [x] Add `SECURITY.md` describing API key handling, rate limits, multi-tenant isolation, and how to report vulnerabilities

---

## Phase 2 — Infrastructure + ingestion (Days 2–4) — M1

- [x] **docker-compose.yml** brings up: redpanda, clickhouse, postgres, redis, caddy, api, ingestion, forecast, frontend
- [x] Add healthchecks to every service; `depends_on: condition: service_healthy` ordering
- [ ] **ClickHouse schema** (`infra/clickhouse/init.sql`):
  - [ ] `events` table per `plan.md` data-model section
  - [ ] `mv_kpi_hourly` materialized view (revenue, count by event_name, hour)
  - [ ] `mv_cohort_daily` materialized view (signup-cohort × activity-day)
  - [ ] `mv_funnel_step_daily` materialized view (placeholder, populated in M5)
- [ ] **Postgres + Prisma** in `api/`:
  - [ ] Schema for users, workspaces, workspace_members, api_keys, dashboards, widgets, alerts, share_links
  - [ ] Initial migration committed
- [ ] **Ingestion REST** (`ingestion/app/ingest_api.py`):
  - [ ] `POST /v1/events` accepts single + batch (`events: [...]`) with API key auth
  - [ ] Pydantic schema validation, 400 on malformed
  - [ ] Produces to Kafka topic `events.raw` with partition key = `workspace_id`
  - [ ] Per-key rate limit (1k events/s sustained, 5k burst) via Redis token bucket
- [ ] **Kafka consumer** (`ingestion/app/consumer.py`):
  - [ ] aiokafka consumer group `events.consumer`
  - [ ] Geo lookup via MaxMind GeoLite2 (free tier), UA parse via `ua-parser`
  - [ ] Micro-batch insert to ClickHouse (1-second window or 1000 rows, whichever first)
  - [ ] Idempotency on `(workspace_id, event_id)` via `ReplacingMergeTree`
  - [ ] Graceful shutdown: drain in-flight batch, commit offsets
- [ ] **End-to-end smoke test**: shell script that POSTs an event and asserts it appears in `SELECT count() FROM events` within 3 seconds
- [ ] **Tests**:
  - [ ] pytest for ingestion: API key auth, schema validation, rate limit, batch insert
  - [ ] pytest for consumer: enrichment, idempotency, batch flush
- [ ] **TS SDK** (`sdk/insightflow-js`):
  - [ ] `track(event, properties)`, `identify(userId, traits)`, `page()`
  - [ ] Async batching (max 20 events or 2 s flush)
  - [ ] Retry with exponential backoff on 5xx
  - [ ] Bundle as ESM + CJS, publish-ready (don't actually publish in v1)

---

## Phase 3 — Auth + dashboard MVP (Days 5–9) — M2

- [ ] **Auth** (`api/src/auth/`):
  - [ ] Signup / login with email + bcrypt password
  - [ ] JWT access + refresh tokens (15 min / 7 day)
  - [ ] Password reset via email (Resend)
  - [ ] Workspace creation on signup
- [ ] **Workspace + API keys**:
  - [ ] `POST /workspaces` create
  - [ ] `POST /workspaces/:id/api-keys` issues `ifk_live_xxx` keys (return once, store hash)
  - [ ] Member invite flow (email link)
- [ ] **`withWorkspace()` helper** — every query that touches ClickHouse or Postgres dashboard data MUST go through this; integration test asserts cross-workspace read returns empty
- [ ] **Dashboards CRUD** (`api/src/dashboards/`):
  - [ ] List, create, update layout, delete
  - [ ] Widget CRUD nested under dashboards
- [ ] **BFF aggregation** (`api/src/events/`):
  - [ ] `GET /events/kpi?metric=mrr&from=...&to=...` — runs against `mv_kpi_hourly`
  - [ ] Redis cache layer (5 s TTL on KPIs)
  - [ ] Parameterised SQL only (no string concat); explicit allowlist of metric names
- [ ] **WebSocket bridge** (`api/src/realtime/`):
  - [ ] Socket.IO server, namespace per workspace
  - [ ] Subscribes to Redis pub/sub channel `metrics:tick:<workspace_id>`
  - [ ] Ingestion publishes a tick (not raw events) every 5 seconds per active workspace
- [ ] **Frontend skeleton** (`frontend/`):
  - [ ] App Router layout with sticky nav, theme toggle
  - [ ] Login / signup pages
  - [ ] Dashboard list + builder (drag-resize widgets — react-grid-layout)
  - [ ] `KpiTile` widget reading live data, "Live" pulse dot
  - [ ] React Query for fetches, Socket.IO for live updates
- [ ] **Seed script** (`scripts/seed_demo.py`):
  - [ ] 90 days of synthetic events: signups, subscriptions, churn, payments
  - [ ] Realistic seasonality (weekly + light yearly), one fake anomaly mid-window for demo
  - [ ] Posts via the public ingest API (proves the contract, doesn't bypass it)

---

## Phase 4 — Forecasting (Days 10–13) — M3

- [ ] **Prophet runner** (`forecast/app/services/prophet_runner.py`):
  - [ ] Fit on daily-aggregated series pulled from ClickHouse
  - [ ] 30 / 60 / 90-day horizon, return `yhat`, `yhat_lower`, `yhat_upper`
  - [ ] Cap training window to last 18 months
  - [ ] Persist fitted model + metadata as `joblib` in `forecast/artifacts/<workspace_id>/<metric>/<timestamp>.pkl`
- [ ] **ARIMA runner** (`forecast/app/services/arima_runner.py`):
  - [ ] auto_arima via pmdarima for order selection
  - [ ] Same horizon contract as Prophet for swap-ability
  - [ ] Used as baseline + fallback when Prophet fails
- [ ] **Model registry** (`forecast/app/services/registry.py`):
  - [ ] Lists fitted models, returns latest by `(workspace_id, metric)`
  - [ ] SHA-256 manifest of artifact bytes — refuse to load tampered artifacts
- [ ] **Endpoints**:
  - [ ] `POST /forecast` — `{workspace_id, metric, horizon_days}` returns forecast band; serves from Redis cache (24 h TTL), falls back to on-demand fit
  - [ ] `POST /retrain` — internal-only; triggered by cron; refits all (workspace, metric) pairs
  - [ ] `GET /models` — registry metadata (fitted_at, training_window, mape, model_kind)
- [ ] **Retrain cron** — GitHub Actions workflow `retrain.yml` on schedule `0 2 * * *` posts to `/retrain` with shared secret. Document the manual local equivalent (`scripts/retrain_cron.sh`).
- [ ] **BFF wrapper** in NestJS (`api/src/forecast/`) — workspace-scoped, hides the internal forecast service URL from the client
- [ ] **Frontend `ForecastBand` widget** — renders historical line + forecast `yhat` line + shaded `yhat_lower..yhat_upper` band; legend states model name and MAPE
- [ ] **Model card view** — per-metric page showing Prophet vs ARIMA MAPE side-by-side on the holdout split (last 14 days). This is the "we're not just calling a magic library" page.
- [ ] **Tests**:
  - [ ] pytest with synthetic seasonal series — assert MAPE < threshold
  - [ ] Snapshot test on forecast JSON shape

---

## Phase 5 — Anomaly detection + alerts (Days 14–15) — M4

- [ ] **Detectors** (`forecast/app/services/anomaly.py`):
  - [ ] Z-score on rolling 7-day window
  - [ ] IQR (1.5 × IQR) on rolling 14-day window
  - [ ] Threshold + sensitivity config per alert
- [ ] **Alert evaluation loop**:
  - [ ] Cron every 5 minutes evaluates all enabled alerts
  - [ ] On trigger: write to Postgres `alert_events`, publish to Redis `alerts:fired:<workspace_id>`
  - [ ] Suppress duplicate fires within configurable cool-down (default 1 h)
- [ ] **Channels**:
  - [ ] Email via Resend
  - [ ] Slack webhook (incoming webhooks, no OAuth needed for v1)
  - [ ] Generic webhook (POST JSON to user-supplied URL with HMAC signature)
- [ ] **Frontend**:
  - [ ] Alert config UI (metric, method, threshold, channels)
  - [ ] Alert history view
  - [ ] Toast on live fire (subscribed via WebSocket)

---

## Phase 6 — Cohort, funnel, PDF export (Days 16–18) — M5

- [ ] **Cohort heatmap**:
  - [ ] ClickHouse query: cohort by signup-week × activity-week
  - [ ] Recharts heatmap (custom `Cell` colouring on a grid)
  - [ ] Toggle between counts and retention %
- [ ] **Funnel chart**:
  - [ ] Funnel definition stored in widget config: ordered list of event_names with optional time-window between steps
  - [ ] ClickHouse query using `windowFunnel()` aggregate
  - [ ] Drop-off bars + conversion rate per step
- [ ] **Drill-down filters** — global panel (date range, country, device, plan, custom property); applies to every widget on the dashboard
- [ ] **PDF export**:
  - [ ] Bull queue job in NestJS
  - [ ] Puppeteer launches headless Chromium, renders dashboard route with `?print=1` flag (hides interactive chrome)
  - [ ] Outputs branded A4 PDF, stores in S3-compatible bucket (MinIO in dev), returns signed URL
  - [ ] Job status polled by frontend; toast on completion

---

## Phase 7 — Hardening + deploy (Days 19–21) — M6

- [ ] **Rate limiting** at Caddy: 100 req/s per IP for HTML, 1k events/s per API key for ingest
- [ ] **CORS** locked to dashboard origin; ingest API has open CORS but requires API key
- [ ] **Signed share links**:
  - [ ] HMAC-signed JWT, dashboard-scoped, expiring
  - [ ] Read-only, no widget edit, no data export
- [ ] **Load test** with k6 — sustained 1k events/s for 10 minutes, p95 ingest latency under 200 ms, dashboard p95 under 500 ms
- [ ] **Observability** — Prometheus + Grafana sidecar in compose (optional but ship the dashboards):
  - [ ] Ingest rate, lag, error rate
  - [ ] ClickHouse insert latency
  - [ ] Forecast retrain duration + MAPE per run
- [ ] **Deploy to Hetzner**:
  - [ ] Provision CX22, install docker + compose
  - [ ] Caddy auto-TLS for the chosen domain
  - [ ] Backup script: nightly `clickhouse-backup` + `pg_dump` to off-box storage
- [ ] **Public demo seed** — workspace `demo` with 90 days of pre-loaded data, read-only viewer link on the landing page
- [ ] **CI** (`.github/workflows/ci.yml`):
  - [ ] Lint (ruff, eslint), typecheck (mypy, tsc), test (pytest, vitest, jest), build all Docker images
  - [ ] Smoke test: spin up compose, hit `/health` on every service

---

## Phase 8 — Docs + demo video (Day 22) — M7

- [ ] README screenshots — KPI dashboard, forecast band, cohort heatmap, funnel, alert toast, model card
- [ ] 2-minute demo video (Loom or screen-recorded MP4 in `docs/demo/`)
- [ ] Architecture diagram exported to `docs/architecture.png` (draw.io or Excalidraw)
- [ ] All five ADRs filled out fully
- [ ] `lessons.md` — what surprised me, what I'd do differently (mirrors the MalVis lessons.md)
- [ ] Submit live URL to portfolio site, link from CV / SoP for German DS Master's application

---

## Out of scope (parking lot for v2)

- SQL editor / ad-hoc query UI
- Custom-metric DSL (today metrics are an allowlist in code)
- BYO-warehouse (Snowflake / BigQuery adapters)
- Mobile app or responsive deep-dive (dashboard is desktop-first)
- RBAC beyond owner / member / viewer
- NeuralProphet, LSTM, transformer-based forecasts
- A/B test analysis module
- Session replay / heatmaps
- Self-serve billing
