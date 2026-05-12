# infra — Docker, ClickHouse schema, Caddy, Kafka topics

Everything the stack needs to come up via `docker compose -f infra/docker-compose.yml up`.

**Services brought up**

- `redpanda` — single-node Kafka-compatible broker (KRaft mode)
- `clickhouse` — OLAP store
- `postgres` — application metadata
- `redis` — cache + pub/sub + Bull queues
- `caddy` — reverse proxy with auto-TLS in deployed envs
- `api` — NestJS BFF
- `ingestion` (two modes) — REST API + Kafka consumer
- `forecast` — FastAPI ML service
- `frontend` — Next.js 14 dashboard
- `minio` (optional) — S3-compatible bucket for PDF export storage

**Layout**

- `docker-compose.yml` — production-shaped compose (built images)
- `docker-compose.dev.yml` — overlay with bind-mounts and `nodemon` / `uvicorn --reload`
- `clickhouse/init.sql` — schema + materialized views (`mv_kpi_hourly`, `mv_cohort_daily`, `mv_funnel_step_daily`)
- `clickhouse/migrations/` — additive forward-only schema changes
- `kafka/topics.yml` — declarative topic config (partitions, retention)
- `caddy/Caddyfile` — reverse proxy + rate limits + TLS
- `grafana/` — optional dashboards for self-monitoring (Prometheus scrape)

All services have `healthcheck:` and `depends_on: condition: service_healthy` so the stack comes up in order.
