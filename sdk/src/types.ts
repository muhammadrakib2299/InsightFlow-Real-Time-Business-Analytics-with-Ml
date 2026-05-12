/**
 * Public types for insightflow-js.
 *
 * Mirrors the Pydantic schemas in ingestion/app/schemas.py — keep these in
 * lockstep when the wire contract changes. The data-model section of
 * docs/data-model.md is the source of truth.
 */

export type EventProperties = Record<string, string | number | boolean | null | undefined>;

export interface InsightFlowOptions {
  /** Base URL of the ingest endpoint, e.g. `https://ingest.insightflow.dev`. */
  endpoint: string;
  /** API key issued by the workspace (prefix `ifk_live_`). */
  apiKey: string;
  /** Flush after this many events are buffered. Default 20. */
  batchSize?: number;
  /** Flush after this many ms even if the buffer is below batchSize. Default 2000. */
  flushIntervalMs?: number;
  /** Max retries on 5xx. Default 3. */
  maxRetries?: number;
  /** Initial backoff in ms. Doubles each retry. Default 250. */
  retryBaseMs?: number;
  /** Override the fetch implementation (Node < 18 / tests). */
  fetch?: typeof fetch;
  /** Override the timer (tests). */
  setTimeout?: typeof setTimeout;
  /** Called for SDK-internal warnings; defaults to console.warn. */
  onError?: (err: unknown) => void;
}

export interface TrackEvent {
  event_id?: string;
  event_name: string;
  user_id?: string;
  session_id?: string;
  occurred_at?: string;
  properties?: EventProperties;
  revenue_cents?: number;
  currency?: string;
  country?: string;
  city?: string;
  device?: string;
  os?: string;
  browser?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

export interface IngestAck {
  accepted: number;
  workspace_id: string;
  queued_to: string;
}
