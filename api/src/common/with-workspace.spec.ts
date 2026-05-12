import { TenantIsolationError, withWorkspace } from './with-workspace';
import type { ClickHouseService } from './clickhouse.service';

function makeFakeCh() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const ch = {
    client: {
      query: (params: unknown) => {
        calls.push({ method: 'query', args: [params] });
        return Promise.resolve({ json: async () => ({ data: [] }) });
      },
      command: (params: unknown) => {
        calls.push({ method: 'command', args: [params] });
        return Promise.resolve({});
      },
    },
  } as unknown as ClickHouseService;
  return { ch, calls };
}

describe('withWorkspace', () => {
  it('rejects a query missing the workspace filter', async () => {
    const { ch } = makeFakeCh();
    await expect(
      withWorkspace(ch, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', async (q) =>
        q.query({ query: 'SELECT 1', format: 'JSON' } as never),
      ),
    ).rejects.toThrow(TenantIsolationError);
  });

  it('rejects raw concatenated workspace literal (still missing the param form)', async () => {
    const { ch } = makeFakeCh();
    await expect(
      withWorkspace(ch, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', async (q) =>
        q.query({
          query: "SELECT * FROM events WHERE workspace_id = 'xyz'",
          format: 'JSON',
        } as never),
      ),
    ).rejects.toThrow(TenantIsolationError);
  });

  it('injects the workspace_id into query_params', async () => {
    const { ch, calls } = makeFakeCh();
    await withWorkspace(ch, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', async (q) =>
      q.query({
        query:
          'SELECT hour FROM v_kpi_hourly WHERE workspace_id = {workspace_id:UUID} AND event_name = {event_name:String}',
        query_params: { event_name: 'mrr' },
        format: 'JSON',
      } as never),
    );
    expect(calls).toHaveLength(1);
    const sent = calls[0].args[0] as { query_params: Record<string, unknown> };
    expect(sent.query_params).toEqual({
      event_name: 'mrr',
      workspace_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    });
  });

  it('does not let caller override the workspace_id via query_params', async () => {
    const { ch, calls } = makeFakeCh();
    await withWorkspace(ch, 'cccccccc-cccc-cccc-cccc-cccccccccccc', async (q) =>
      q.query({
        query:
          'SELECT 1 FROM v_kpi_hourly WHERE workspace_id = {workspace_id:UUID}',
        // Caller tries to sneak a different workspace
        query_params: { workspace_id: 'attacker-id' },
        format: 'JSON',
      } as never),
    );
    const sent = calls[0].args[0] as { query_params: Record<string, unknown> };
    expect(sent.query_params.workspace_id).toBe(
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
    );
  });

  it('rejects empty workspaceId', async () => {
    const { ch } = makeFakeCh();
    await expect(
      withWorkspace(ch, '', async (q) =>
        q.query({
          query: 'SELECT 1 WHERE workspace_id = {workspace_id:UUID}',
          format: 'JSON',
        } as never),
      ),
    ).rejects.toThrow(TenantIsolationError);
  });
});
