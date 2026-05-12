# Security

InsightFlow is pre-1.0 and self-hostable. This document describes how the project handles credentials, isolates tenants, and how to report vulnerabilities.

## Reporting a vulnerability

**Please do not file public GitHub issues for security problems.**

Email **mrabbani@combosoft.co.uk** with:

- A description of the issue and the impact you believe it has
- Steps to reproduce (a minimal proof-of-concept is ideal)
- Any logs, payloads, or screenshots that help

We aim to acknowledge reports within 72 hours. Once a fix is in `main`, we will credit you in the release notes unless you prefer to remain anonymous.

## Supported versions

InsightFlow is pre-1.0. Only the current `main` branch receives security fixes.

| Version | Supported |
|---|---|
| `main` (HEAD) | Yes |
| Tagged `v0.x` releases | Best-effort |

## API key handling

- API keys are issued per workspace and use the prefix `ifk_live_`.
- The full key is returned **once at creation time** and never again. The server stores only an Argon2 hash (`api_keys.hash`) and the visible prefix (`api_keys.prefix`) for lookup and revocation UX.
- Keys can be revoked from the workspace settings; revoked keys have `revoked_at` set and are rejected at the ingestion edge.
- Keys are bound to a single workspace and cannot be used to access another workspace's data.

## Rate limits

- **Ingestion** (`POST /v1/events`): 1,000 events/second sustained, 5,000-event burst per API key, enforced with a Redis token bucket. Excess requests return `429 Too Many Requests` with a `Retry-After` header.
- **Dashboard HTML / API**: 100 requests/second per source IP at the Caddy edge.
- **Login / signup**: stricter per-IP throttle (10/min) to slow credential stuffing.

## Multi-tenant isolation

InsightFlow uses row-level multi-tenancy with `workspace_id` as the first clustering column in every ClickHouse table (see [`docs/ADR-005-multitenant-row-level.md`](./docs/ADR-005-multitenant-row-level.md)).

Application-layer enforcement:

- Every dashboard query in the API service routes through a single `withWorkspace(workspaceId, fn)` helper. Bypassing this helper is a CI failure (a static lint forbids direct ClickHouse client calls outside `api/src/common/`).
- API keys are workspace-scoped at the edge: the ingestion service rejects any event whose `workspace_id` does not match the key's workspace.
- Integration tests in `api/test/` explicitly attempt cross-workspace reads and assert empty results.

## Transport and storage

- All public traffic terminates at Caddy with automatic TLS (Let's Encrypt). Internal service-to-service traffic stays on the docker network.
- Passwords are hashed with bcrypt (cost factor 12).
- JWTs use HS256 with separate secrets for access (`JWT_ACCESS_SECRET`) and refresh (`JWT_REFRESH_SECRET`) tokens. Access tokens expire in 15 minutes; refresh tokens in 7 days.
- Share links are HMAC-signed JWTs, dashboard-scoped, read-only, and expiring. Secret: `SHARE_LINK_SECRET`.
- PII (email addresses, IPs) is stored in Postgres only. Raw IP is not persisted in ClickHouse — geo enrichment derives country/city at ingest time and the IP is dropped.

## Secrets management

- Local development uses `.env` (gitignored). The `.env.example` file is the canonical list of every variable consumed across services.
- Production secrets should be injected via the host's environment, not committed. Avoid baking secrets into Docker images.
- Webhook signature secrets (Slack incoming webhooks, generic webhooks with HMAC) are stored encrypted at rest in Postgres using a workspace-scoped key.

## Dependencies

- `npm audit` and `pip-audit` run on every CI build.
- Dependabot is enabled on the repository for npm, pip, GitHub Actions, and Docker base images.

## Out of scope for v1

- Role-based access control beyond owner / member / viewer
- Customer-managed encryption keys
- SOC 2 / ISO 27001 attestations
- Self-serve audit log export

These are tracked in [`todo.md`](./todo.md) under "v2".
