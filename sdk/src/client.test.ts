import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from './client';

function mockFetchOk(body: unknown = { accepted: 1, workspace_id: 'w', queued_to: 'events.raw' }) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status: 202, headers: { 'content-type': 'application/json' } }),
  );
}

describe('InsightFlowClient', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes once batchSize is reached', async () => {
    const fetchMock = mockFetchOk();
    const client = createClient({
      endpoint: 'http://x',
      apiKey: 'ifk_live_test_key',
      batchSize: 3,
      fetch: fetchMock as unknown as typeof fetch,
    });
    void client.track('a');
    void client.track('b');
    const p = client.track('c');
    await p;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    const body = JSON.parse(call[1]!.body as string);
    expect(body.events.length).toBe(3);
  });

  it('flushes on flushIntervalMs even if under batchSize', async () => {
    const fetchMock = mockFetchOk();
    const client = createClient({
      endpoint: 'http://x',
      apiKey: 'ifk_live_test_key',
      batchSize: 99,
      flushIntervalMs: 500,
      fetch: fetchMock as unknown as typeof fetch,
    });
    void client.track('only');
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx with backoff', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      if (calls < 3) {
        return new Response('boom', { status: 503 });
      }
      return new Response(
        JSON.stringify({ accepted: 1, workspace_id: 'w', queued_to: 'events.raw' }),
        { status: 202 },
      );
    });
    const client = createClient({
      endpoint: 'http://x',
      apiKey: 'ifk_live_test_key',
      batchSize: 1,
      maxRetries: 3,
      retryBaseMs: 10,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const ack = client.track('boom');
    // Advance through both retry backoffs
    await vi.advanceTimersByTimeAsync(1000);
    await ack;
    expect(calls).toBe(3);
  });

  it('rejects 4xx without retry', async () => {
    const fetchMock = vi.fn(async () => new Response('bad', { status: 400 }));
    const client = createClient({
      endpoint: 'http://x',
      apiKey: 'ifk_live_test_key',
      batchSize: 1,
      maxRetries: 5,
      retryBaseMs: 10,
      fetch: fetchMock as unknown as typeof fetch,
      onError: () => {},
    });
    await expect(client.track('x')).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('identify sets the $identify event', async () => {
    const fetchMock = mockFetchOk();
    const client = createClient({
      endpoint: 'http://x',
      apiKey: 'ifk_live_test_key',
      batchSize: 1,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await client.identify('user-123', { plan: 'pro' });
    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.event_name).toBe('$identify');
    expect(body.user_id).toBe('user-123');
    expect(body.properties).toEqual({ plan: 'pro' });
  });
});
