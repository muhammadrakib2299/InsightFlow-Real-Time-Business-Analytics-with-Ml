# ADR-005 — Multi-tenant via row-level `workspace_id`

- **Status:** Accepted
- **Date:** 2026-05-12
- **Deciders:** Md. Rakib
- **Supersedes:** —
- **Superseded by:** —

## Context

InsightFlow is multi-tenant from day one — every customer is a "workspace", and a single self-hosted instance can serve many of them. Three isolation models were on the table:

1. **Database-per-tenant** — one Postgres + one ClickHouse cluster per workspace. Strongest isolation, totally impractical at any meaningful tenant count.
2. **Schema-per-tenant** — one schema per workspace inside shared databases. Works in Postgres up to a point, breaks in ClickHouse because every materialized view would need to be duplicated per schema, blowing up the merge cost.
3. **Row-level isolation with a tenant column** — one set of tables, every row carries `workspace_id`, every query filters on it.

## Decision

We use **row-level multi-tenancy with `workspace_id` as the first ORDER BY column in every ClickHouse table** and as a NOT NULL foreign key in every relevant Postgres table.

The application-layer guardrail is a single shared **`withWorkspace(workspaceId, fn)`** helper in NestJS — every read or write that touches dashboard or event data goes through it, and the helper is the only place that splices `workspace_id` into the query.

## Why

- **One materialized view per metric, not per tenant.** With `workspace_id` first in the ORDER BY, ClickHouse merges per-tenant data into the same parts and serves `WHERE workspace_id = ?` queries via primary-key skip indexes — the per-tenant query cost is constant in the number of tenants, not linear.
- **One Prisma schema, one migration history.** No per-tenant schema drift. Migrations apply once and affect everyone, which is correct because we ship one product to everyone.
- **Cheap to operate.** A single ClickHouse cluster, a single Postgres database, a single Redis. Suitable for a $5 VPS.
- **A single integration test surface for isolation.** We can write three integration tests that explicitly attempt cross-workspace reads (via `api` and via the SDK API key) and assert empty results. Centralised guard = centralised test target.

## Trade-offs

- **Application-layer enforcement.** A forgotten `workspace_id` filter is a data leak. Mitigated by:
  - The `withWorkspace()` helper is the only allowed gateway; direct ClickHouse / Postgres access from controllers is a code-review fail.
  - Three integration tests that try to cross workspaces and assert empty results, run in CI.
  - PR review for any change under `api/src/common/clickhouse.service.ts` and `api/src/common/prisma.service.ts`.
- **No physical row separation.** A bug in our isolation layer affects every customer. Accepted as a portfolio-stage risk; a v2 hardening step is row-level security in Postgres (`CREATE POLICY ... USING (workspace_id = current_setting(...)`).
- **Per-tenant data deletion is a `DELETE` over indexed rows rather than a `DROP DATABASE`.** Slower, but acceptable at our scale.

## Consequences

- Every ClickHouse table in `infra/clickhouse/init.sql` starts with `ORDER BY (workspace_id, ...)`.
- Every Postgres table in `api/prisma/schema.prisma` that holds tenant data has `workspace_id Uuid` as a non-null indexed column.
- `api/src/common/clickhouse.service.ts` and `api/src/common/prisma.service.ts` expose only the `withWorkspace()` API; raw clients are not exported.
- `api/test/isolation.spec.ts` (added in M2) holds the three cross-workspace negative tests.
