# InsightFlow — Real-Time Business Analytics Dashboard with ML Forecasting

> Open-source, self-hostable BI platform. Ingest sales and product events in real time, forecast revenue / churn / demand with Prophet and ARIMA, get Z-score anomaly alerts, drill into cohorts and funnels, and export branded PDF reports — all on a single `docker compose up`.

[![CI](https://img.shields.io/badge/CI-pending-lightgrey.svg)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![ClickHouse](https://img.shields.io/badge/ClickHouse-FFCC01?logo=clickhouse&logoColor=black)](https://clickhouse.com/)
[![Kafka](https://img.shields.io/badge/Kafka-231F20?logo=apachekafka&logoColor=white)](https://kafka.apache.org/)

**Live demo:** _coming soon_ · **Docs:** [`docs/`](./docs)

---

## Why this project exists

Most teams reach a point where Stripe + Google Analytics + a hand-rolled metabase dashboard stop scaling: the numbers disagree, the SQL is copy-pasted across notebooks, and "where is revenue heading next quarter?" still gets answered by guesswork. Closed BI tools (Tableau, Power BI, Looker) solve some of that — at four-figure seat licenses, vendor lock-in, and zero forecasting out of the box.

InsightFlow is the open-source middle ground. It pairs an event-streaming pipeline (Kafka → ClickHouse) with automatic forecasting (Prophet + ARIMA) and anomaly detection (Z-score + IQR), and ships the whole thing as a containerized stack you can run on a single VPS. Three things it does that a notebook or a closed BI tool can't:

1. **Streaming + analytical, in one stack.** Sub-second writes via Kafka, sub-second reads via ClickHouse materialized views. No nightly ETL, no stale dashboards.
2. **Forecasts as first-class citizens.** Every KPI ships with a 30 / 60 / 90-day projection and confidence interval, retrained nightly on the latest window — no data scientist required.
3. **Inspectable and self-hosted.** Your event data never leaves your infra. The model code is readable Python, not a black-box vendor blob.

---

## Who this helps and the impact it creates

Analytics tooling has split into two unhappy camps: spreadsheets and SQL notebooks for teams that can't afford enterprise BI, or six-figure platforms for teams that can. Neither comes with forecasting. InsightFlow exists because **a dashboard that only shows the past is half a tool** — operators need to see where the line is going, not just where it has been.

**Who benefits**

- **Founders and operators of small-to-mid SaaS and e-commerce businesses** — the people who today juggle Stripe dashboards, GA4, and a homemade Metabase board, and still can't tell whether next month's revenue will clear payroll. InsightFlow gives them MRR, churn, ARPU, and a forecasted runway in one pane.
- **Growth and marketing teams** — funnel analysis, cohort retention curves, and channel attribution that update live as events stream in, not on a 24-hour ETL lag.
- **Data engineers and analytics engineers** — a reference implementation of a modern streaming OLAP stack (Kafka, ClickHouse, materialized views, Prophet retraining) they can fork rather than reinvent. The ADRs in `docs/` document the trade-offs explicitly.
- **Backend engineers learning data infrastructure** — the codebase is intentionally readable: NestJS BFF, FastAPI ML service, Python stream worker. Each service is small enough to fit in your head.
- **Universities and bootcamps teaching applied data science** — a non-toy, end-to-end pipeline that exercises ingestion, OLAP modelling, time-series forecasting, anomaly detection, and full-stack delivery in one repo.
- **Under-resourced teams in regions where Tableau / Looker pricing is prohibitive** — MIT-licensed, self-hosted, and free.

**The positive impact**

- **Better decisions earlier.** A forecast that lands a week before the cash crunch is worth more than a perfect retrospective dashboard. Surfacing the trend early is the entire point.
- **Anomalies caught in minutes, not days.** Z-score and IQR alerts on rolling windows mean a 40% drop in checkout conversion pages someone the same hour, not in next Monday's review.
- **Vendor independence.** Your customer event data stays in your ClickHouse instance. No third party gets to mine, resell, or get breached with it.
- **Lower analytics floor.** A team of three can run the same kind of stack a unicorn runs, on a $40/month VPS — narrowing the gap between teams that can afford analytics and teams that can't.
- **Forecasting becomes a default, not a project.** Most teams never get around to building forecasts because it's a separate ML initiative. Here it ships in the box.

In short: InsightFlow is a small but concrete step toward **analytics that small teams can actually run, trust, and act on** — and that's a net good for the operators, the customers they serve, and the engineers who'd rather build product than re-implement Metabase.

---

## Features

- **Event ingestion** — TypeScript SDK (`insightflow-js`), REST endpoint, and Stripe / Shopify webhook receivers
- **Streaming pipeline** — Kafka topics → Python stream worker → ClickHouse with idempotent micro-batched inserts
- **Real-time KPIs** — MRR, ARPU, churn rate, DAU/MAU, conversion rate, gross margin — sub-second refresh
- **ML forecasting** — Prophet (primary) + ARIMA (baseline) for revenue / demand / churn, 30 / 60 / 90-day horizons with confidence intervals
- **Auto-retrain** — nightly cron pulls latest window, retrains, versions artifacts in a model registry
- **Anomaly detection** — Z-score + IQR on rolling windows, alerts via email / Slack / generic webhook
- **Cohort analysis** — retention heatmaps, configurable weekly / monthly cohorts
- **Funnel analysis** — multi-step funnels with drop-off rates and segment filters
- **Drill-down filters** — geo, device, plan, segment, and arbitrary custom properties
- **PDF export** — one-click branded reports rendered with Puppeteer
- **Multi-tenant workspaces** — row-level isolation across ClickHouse and Postgres
- **Shareable dashboards** — signed-token public read-only links
- **Containerized** — single `docker compose up` brings up the full stack

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

The data contract between the SDK, ingestion worker, and ClickHouse schema is the load-bearing surface of the system — see [`docs/data-model.md`](./docs/data-model.md). Trade-offs (ClickHouse vs TimescaleDB, Kafka vs Redis Streams, Prophet vs ARIMA) are recorded as ADRs in [`docs/`](./docs).

- **Frontend** — Next.js 14 (App Router) + TypeScript + TailwindCSS + Recharts; live updates via WebSocket
- **API (BFF)** — NestJS + Prisma + Postgres for users / dashboards / alerts metadata; Puppeteer for PDF export
- **Ingestion** — Python 3.11 stream worker reading from Kafka, batching to ClickHouse
- **Forecast service** — FastAPI + Prophet + statsmodels (ARIMA) + scikit-learn (anomaly)
- **Storage** — ClickHouse (events, aggregates, materialized views), Postgres (metadata), Redis (cache + pub/sub)
- **Deployment** — Docker images orchestrated via docker-compose; Caddy as reverse proxy with TLS

---

## Folder structure

```
insightflow/
├── api/                  NestJS BFF — auth, dashboards, alerts, PDF export
├── ingestion/            Python Kafka → ClickHouse stream worker + REST ingest endpoint
├── forecast/             FastAPI ML service — Prophet, ARIMA, anomaly detection
├── frontend/             Next.js 14 dashboard with Recharts
├── sdk/                  TypeScript SDK (`insightflow-js`) for client event tracking
├── infra/
│   ├── docker-compose.yml
│   ├── clickhouse/       schemas, migrations, materialized views
│   ├── kafka/            topic configuration
│   └── caddy/            reverse proxy, TLS, rate limits
├── docs/
│   ├── architecture.md
│   ├── data-model.md
│   ├── ADR-001-clickhouse-vs-timescale.md
│   ├── ADR-002-kafka-vs-redis-streams.md
│   └── ADR-003-forecast-model-choice.md
├── scripts/              seed data, load generator, retraining cron
├── tests/                e2e (Playwright) + load tests (k6)
├── .github/workflows/    ci.yml, retrain.yml
├── pyproject.toml
├── package.json          npm workspaces root
├── README.md
├── plan.md
└── todo.md
```

---

## Tech stack

**Frontend** Next.js 14 · TypeScript · TailwindCSS · Recharts · React Query · Zustand · Socket.IO client
**API** NestJS 10 · TypeScript · Prisma · Postgres · Redis · Bull (queues) · Puppeteer
**Ingestion** Python 3.11 · aiokafka · clickhouse-driver · pydantic · FastAPI (REST ingest)
**Forecast** Python 3.11 · FastAPI · Prophet · statsmodels · scikit-learn · pandas · numpy
**Streaming + storage** Apache Kafka · ClickHouse · Postgres · Redis
**Infra** Docker · docker-compose · Caddy · GitHub Actions
**Observability** Prometheus + Grafana (optional, in `infra/grafana/`)

---

## Getting started

### Prerequisites

- Docker 24+ and docker-compose v2
- Node.js 20+ (only if developing outside containers)
- Python 3.11+ (only if developing outside containers)

### One-command run

```bash
git clone https://github.com/<your-username>/insightflow.git
cd insightflow
cp .env.example .env
docker compose up -d
```

After ~30 seconds the stack is up:

- Dashboard: http://localhost:3000
- API: http://localhost:4000
- Forecast service: http://localhost:8000
- ClickHouse HTTP: http://localhost:8123
- Kafka UI (Redpanda Console): http://localhost:8080

### Seed sample data

```bash
docker compose exec api npm run seed:demo
```

This generates 90 days of synthetic e-commerce events (orders, signups, page views) so the dashboards have something to render and the forecaster has a window to train on.

### Send your first real event

Via the SDK:

```ts
import { InsightFlow } from 'insightflow-js';
const client = new InsightFlow({ apiKey: process.env.IF_KEY!, host: 'http://localhost:4000' });
await client.track('order_completed', { value: 49.0, currency: 'USD', plan: 'pro' });
```

Via REST:

```bash
curl -X POST http://localhost:4000/v1/events \
  -H "Authorization: Bearer $IF_KEY" \
  -H "Content-Type: application/json" \
  -d '{"event":"order_completed","properties":{"value":49.0,"currency":"USD"}}'
```

---

## Roadmap

See [`todo.md`](./todo.md) for the phased build checklist and [`plan.md`](./plan.md) for architecture decisions and milestones.

---

## License

MIT — see [`LICENSE`](./LICENSE).
