# docs

Design documentation for InsightFlow.

- [`architecture.md`](./architecture.md) — services, data flow (write + read paths), responsibilities
- [`data-model.md`](./data-model.md) — ClickHouse + Postgres schemas, event contract between SDK / ingestion / ClickHouse
- [`ADR-001-clickhouse-vs-timescale.md`](./ADR-001-clickhouse-vs-timescale.md)
- [`ADR-002-kafka-vs-redis-streams.md`](./ADR-002-kafka-vs-redis-streams.md)
- [`ADR-003-forecast-model-choice.md`](./ADR-003-forecast-model-choice.md)
- [`ADR-004-nestjs-bff-fastapi-ml.md`](./ADR-004-nestjs-bff-fastapi-ml.md)
- [`ADR-005-multitenant-row-level.md`](./ADR-005-multitenant-row-level.md)
- `lessons.md` — post-build retrospective (authored in M7)

The ADRs are concise on purpose — one paragraph of "why", one of "trade-off", expanded as decisions land in code.
