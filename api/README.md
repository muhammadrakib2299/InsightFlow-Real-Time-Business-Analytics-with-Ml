# api — NestJS BFF

Backend-for-frontend for the InsightFlow dashboard.

**Responsibilities**

- Auth: signup / login / refresh, JWT access + refresh, password reset via Resend
- Workspaces, members, API keys (issue + revoke)
- Dashboards + widgets CRUD
- Alerts config + history
- BFF aggregation queries to ClickHouse (parameterised SQL, metric-name allowlist, Redis cache)
- WebSocket bridge (Socket.IO) for live KPI ticks, subscribes to Redis pub/sub
- Forecast wrapper — proxies to the internal FastAPI forecast service, hides its URL from clients
- PDF export — Puppeteer renderer driven by a Bull queue

**Storage**

- Postgres (via Prisma) for users, workspaces, dashboards, widgets, alerts, share links
- ClickHouse (read-only from `api`) for event aggregates
- Redis for cache, pub/sub, Bull queues

**Layout** (`src/`)

- `auth/` — controllers, guards, JWT strategy
- `workspaces/` — workspace + member + API-key endpoints
- `dashboards/` — dashboards + widgets CRUD
- `alerts/` — alert config + history
- `events/` — BFF aggregation against ClickHouse
- `forecast/` — wrapper around the forecast service
- `pdf/` — Puppeteer renderer + Bull queue
- `realtime/` — Socket.IO server, Redis pub/sub bridge
- `common/` — Prisma, Redis, ClickHouse clients shared across modules
