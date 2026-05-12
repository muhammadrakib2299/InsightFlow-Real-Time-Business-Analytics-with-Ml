# ingestion — event intake + Kafka → ClickHouse stream worker

Python 3.11 service. Two processes share this codebase:

1. **REST API** (`app/ingest_api.py`) — FastAPI server exposing `POST /v1/events` (single + batch). Validates payload, authenticates the API key, applies a per-key Redis token-bucket rate limit, and produces to Kafka topic `events.raw` keyed by `workspace_id`.
2. **Kafka consumer** (`app/consumer.py`) — aiokafka consumer group `events.consumer`. Enriches each event (geo via MaxMind GeoLite2, UA parse) and writes to ClickHouse in 1-second / 1000-row micro-batches. Idempotency is guaranteed by `ReplacingMergeTree` on `(workspace_id, event_id)`.

Both processes are launched from `app/main.py` depending on `INGESTION_MODE=api|consumer`.

**Layout**

- `app/main.py` — process entrypoint, mode dispatch
- `app/ingest_api.py` — FastAPI app, `/v1/events`, rate limiter, API-key auth
- `app/consumer.py` — Kafka consumer + ClickHouse micro-batch writer
- `app/enrich.py` — geo + UA enrichment
- `app/schemas.py` — pydantic request/response models
- `tests/` — pytest

See `docs/data-model.md` for the event schema contract.
