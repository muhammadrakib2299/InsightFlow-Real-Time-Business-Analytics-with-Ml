# ADR-004 — NestJS BFF, FastAPI for ML

- **Status:** Accepted
- **Date:** 2026-05-12
- **Deciders:** Md. Rakib
- **Supersedes:** —
- **Superseded by:** —

## Context

InsightFlow has two distinct workloads:

1. **Web application concerns** — auth, workspace + dashboard CRUD, alert config, BFF aggregation queries to ClickHouse, WebSocket fan-out, PDF rendering via Puppeteer.
2. **ML inference concerns** — Prophet / ARIMA fits, joblib artifact loading, Z-score / IQR anomaly evaluation, model registry.

These have very different dependency footprints and very different cold-start characteristics. NestJS apps want hot-reload over a small surface; Python ML services want pre-loaded NumPy / Prophet processes that take 2–3 seconds to import.

## Decision

Run **two backend services**:

- **`api/`** — NestJS 10, TypeScript, Prisma → Postgres, Redis client, ClickHouse HTTP client, Socket.IO, Puppeteer. This is the only service the frontend talks to.
- **`forecast/`** — FastAPI, Prophet, pmdarima, scikit-learn, pandas, NumPy. Internal-only — never exposed through Caddy.

The contract between them is a thin HTTP API (`POST /forecast`, `POST /retrain`, `GET /models`, `POST /anomaly/evaluate`). `api` is the only allowed caller; the URL is in `FORECAST_SERVICE_URL` and not leaked to the browser.

## Why

- **Velocity.** The Combosoft team's existing TypeScript / NestJS expertise applies directly to `api`; the Python ML ecosystem applies directly to `forecast`. Forcing one stack to do both would double the build time.
- **Right tool, right cold-start.** Heavy NumPy / Prophet imports happen once per process in `forecast`; the NestJS API container stays small and reloads in 200 ms.
- **Independent scaling.** If the forecast service ever needs a beefier box (more memory for concurrent fits), we scale it without touching `api`.
- **Cleaner BFF surface.** The frontend never knows the forecast service exists — `api` proxies, caches, and authorises every request workspace-by-workspace.

## Trade-offs

- **Two services to deploy, two CI jobs, two Dockerfiles.** Real cost, but the docker-compose stack already orchestrates 8+ containers, so adding one more is marginal.
- **Internal HTTP latency.** A `forecast` call adds ~5 ms of network overhead vs. an in-process call. Negligible compared to a Prophet fit.
- **Auth across the boundary.** `api` authenticates the user via JWT and then calls `forecast` with a shared internal secret (`RETRAIN_SHARED_SECRET` for retrain, plain HTTP within the docker network for read APIs). The boundary is closed by the network, not by per-request auth.

## Consequences

- `api/src/forecast/` is a thin wrapper module — workspace-scoped, caches forecast responses in Redis (24 h TTL), and never exposes the internal URL.
- `forecast/` is never published behind Caddy; `infra/docker-compose.yml` does not map its port to the host except via the dev override.
- If we later want to merge the two services (e.g., port Prophet to Node, or rewrite the ML side in Go), the internal HTTP contract is the cut point — easy to refactor.
