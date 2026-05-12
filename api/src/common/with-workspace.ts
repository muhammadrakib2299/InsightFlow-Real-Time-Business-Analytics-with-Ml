/**
 * The single chokepoint every ClickHouse query routes through.
 *
 * Two guarantees:
 *   1. The query receives a workspace_id parameter and the SQL must
 *      reference it (we runtime-check before execution).
 *   2. Parameters are bound via clickhouse-client params, never string-
 *      concatenated. ClickHouse's parameterised query syntax is
 *      `{name:Type}` — the lint rule below enforces it.
 *
 * Usage:
 *
 *   withWorkspace(ch, workspaceId, async (q) =>
 *     q.query({
 *       query: `
 *         SELECT hour, sumMerge(revenue_cents) AS revenue
 *         FROM v_kpi_hourly
 *         WHERE workspace_id = {workspace_id:UUID}
 *           AND event_name   = {event_name:String}
 *         GROUP BY hour
 *         ORDER BY hour
 *       `,
 *       query_params: { event_name: 'subscription_payment' },
 *       format: 'JSON',
 *     }),
 *   );
 */

import type { ClickHouseService } from './clickhouse.service';
import type { ClickHouseClient } from '@clickhouse/client';

const WORKSPACE_PARAM_REGEX = /workspace_id\s*=\s*\{workspace_id:UUID\}/i;

export interface WorkspaceQueryFn<T> {
  (
    q: {
      query: ClickHouseClient['query'];
      command: ClickHouseClient['command'];
    },
    workspaceId: string,
  ): Promise<T>;
}

export class TenantIsolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantIsolationError';
  }
}

/**
 * Wraps a ClickHouse query in a workspace-bound context. Refuses to run
 * any query whose text does not include `workspace_id = {workspace_id:UUID}`,
 * and automatically injects `workspace_id` into the query_params bag.
 */
export async function withWorkspace<T>(
  ch: ClickHouseService,
  workspaceId: string,
  fn: WorkspaceQueryFn<T>,
): Promise<T> {
  if (!workspaceId) throw new TenantIsolationError('workspaceId required');

  const guardedClient = ch.client;

  const wrappedQuery: ClickHouseClient['query'] = (params) => {
    const q = params.query;
    if (!WORKSPACE_PARAM_REGEX.test(q)) {
      throw new TenantIsolationError(
        'every ClickHouse query must filter `workspace_id = {workspace_id:UUID}` — ' +
          'this is enforced to prevent cross-tenant leaks (ADR-005).',
      );
    }
    return guardedClient.query({
      ...params,
      query_params: {
        ...(params.query_params ?? {}),
        workspace_id: workspaceId,
      },
    });
  };

  const wrappedCommand: ClickHouseClient['command'] = (params) => {
    const q = params.query;
    if (!WORKSPACE_PARAM_REGEX.test(q)) {
      throw new TenantIsolationError(
        'every ClickHouse command must filter `workspace_id = {workspace_id:UUID}`',
      );
    }
    return guardedClient.command({
      ...params,
      query_params: {
        ...(params.query_params ?? {}),
        workspace_id: workspaceId,
      },
    });
  };

  return fn({ query: wrappedQuery, command: wrappedCommand }, workspaceId);
}
