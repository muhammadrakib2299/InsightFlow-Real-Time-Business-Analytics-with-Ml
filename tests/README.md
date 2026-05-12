# tests

Cross-service integration and performance tests.

- `e2e/` — Playwright tests. Drive the dashboard UI against the full docker-compose stack. Covers signup → workspace → API key → SDK event → KPI tile updates.
- `load/` — k6 scripts for the M6 load benchmark: sustain 1k events/s for 10 minutes against `ingestion`, asserting p95 < 200 ms and zero data loss in ClickHouse.

Per-service unit tests live alongside their service (`api/test/`, `ingestion/tests/`, `forecast/tests/`). Tests that hit ClickHouse / Kafka / Postgres do **not** use mocks — they use the docker-compose stack (see `CONTRIBUTING.md`).
