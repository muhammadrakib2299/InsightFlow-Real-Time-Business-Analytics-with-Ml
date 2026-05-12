import type {
  EventProperties,
  IngestAck,
  InsightFlowOptions,
  TrackEvent,
} from './types';

const DEFAULT_BATCH = 20;
const DEFAULT_FLUSH_MS = 2000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 250;

type Resolved<T> = {
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

interface Pending {
  events: TrackEvent[];
  waiters: Resolved<IngestAck>[];
}

export class InsightFlowClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly onError: (err: unknown) => void;

  private queue: TrackEvent[] = [];
  private waiters: Resolved<IngestAck>[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: InsightFlowOptions) {
    if (!options.endpoint) throw new Error('insightflow: endpoint is required');
    if (!options.apiKey) throw new Error('insightflow: apiKey is required');
    this.endpoint = options.endpoint.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.fetchImpl =
      options.fetch ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined as any);
    this.setTimeoutImpl = options.setTimeout ?? setTimeout;
    this.onError =
      options.onError ??
      ((err) => {
        // eslint-disable-next-line no-console
        console.warn('[insightflow]', err);
      });
    if (!this.fetchImpl) {
      throw new Error(
        'insightflow: no fetch implementation available; pass options.fetch on Node < 18',
      );
    }
  }

  track(
    eventName: string,
    properties: EventProperties = {},
    overrides: Partial<TrackEvent> = {},
  ): Promise<IngestAck> {
    return this.enqueue({
      event_name: eventName,
      properties,
      ...overrides,
    });
  }

  identify(userId: string, traits: EventProperties = {}): Promise<IngestAck> {
    return this.enqueue({
      event_name: '$identify',
      user_id: userId,
      properties: traits,
    });
  }

  page(name?: string, properties: EventProperties = {}): Promise<IngestAck> {
    return this.enqueue({
      event_name: '$page_view',
      properties: name ? { ...properties, page: name } : properties,
    });
  }

  private enqueue(evt: TrackEvent): Promise<IngestAck> {
    this.queue.push(evt);
    const promise = new Promise<IngestAck>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
    if (this.queue.length >= this.batchSize) {
      void this.flush();
    } else {
      this.scheduleFlush();
    }
    return promise;
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = this.setTimeoutImpl(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch: Pending = { events: this.queue, waiters: this.waiters };
    this.queue = [];
    this.waiters = [];
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      const ack = await this.send(batch.events);
      for (const w of batch.waiters) w.resolve(ack);
    } catch (err) {
      this.onError(err);
      for (const w of batch.waiters) w.reject(err);
    }
  }

  private async send(events: TrackEvent[]): Promise<IngestAck> {
    const body = events.length === 1 ? events[0] : { events };
    let attempt = 0;
    let lastErr: unknown;
    while (attempt <= this.maxRetries) {
      try {
        const res = await this.fetchImpl(`${this.endpoint}/v1/events`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
          },
          body: JSON.stringify(body),
        });
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`insightflow: server returned ${res.status}`);
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`insightflow: ${res.status} ${text}`);
        }
        return (await res.json()) as IngestAck;
      } catch (err) {
        lastErr = err;
        attempt += 1;
        if (attempt > this.maxRetries) break;
        const delay =
          this.retryBaseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * this.retryBaseMs);
        await new Promise<void>((resolve) => this.setTimeoutImpl(resolve, delay));
      }
    }
    throw lastErr;
  }

  async close(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

export function createClient(options: InsightFlowOptions): InsightFlowClient {
  return new InsightFlowClient(options);
}
