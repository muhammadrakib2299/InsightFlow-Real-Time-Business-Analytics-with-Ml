// k6 load test for the ingest path.
//
// Goal:   sustain 1,000 events/sec for 10 minutes
// Targets: p95 ingest latency < 200ms, error rate < 1%
//
// Usage:
//   k6 run -e INGEST_URL=http://localhost:5000 -e API_KEY=ifk_live_xxx tests/load/ingest.js
//
// On a developer laptop you probably want a shorter version:
//   k6 run -e INGEST_URL=http://localhost:5000 -e API_KEY=ifk_live_xxx \
//          --duration 60s --vus 50 tests/load/ingest.js

import http from 'k6/http';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { uuidv4, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const errorRate = new Rate('ingest_errors');
export const ingestLatency = new Trend('ingest_latency_ms', true);

const INGEST_URL = __ENV.INGEST_URL || 'http://localhost:5000';
const API_KEY = __ENV.API_KEY || '';

const EVENTS = ['signup', 'session_start', 'subscription_payment', 'page_view'];
const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'IN'];
const DEVICES = ['desktop', 'mobile', 'tablet'];

export const options = {
  scenarios: {
    sustained: {
      executor: 'constant-arrival-rate',
      // 1000 events/sec — k6 will provision VUs to hit it
      rate: 1000,
      timeUnit: '1s',
      duration: __ENV.DURATION || '10m',
      preAllocatedVUs: 50,
      maxVUs: 500,
    },
  },
  thresholds: {
    'http_req_failed': ['rate<0.01'],
    'http_req_duration': ['p(95)<200', 'p(99)<500'],
    'ingest_latency_ms': ['p(95)<200'],
    'ingest_errors': ['rate<0.01'],
  },
};

export function setup() {
  if (!API_KEY) {
    throw new Error('Set API_KEY env (ifk_live_…) — provision with /api/workspaces/:id/api-keys');
  }
}

export default function () {
  const body = {
    event_id: uuidv4(),
    event_name: EVENTS[randomIntBetween(0, EVENTS.length - 1)],
    user_id: `u_${uuidv4().slice(0, 8)}`,
    session_id: `s_${uuidv4().slice(0, 8)}`,
    occurred_at: new Date().toISOString(),
    revenue_cents: randomIntBetween(0, 19_900),
    currency: 'USD',
    country: COUNTRIES[randomIntBetween(0, COUNTRIES.length - 1)],
    device: DEVICES[randomIntBetween(0, DEVICES.length - 1)],
    properties: { plan: 'starter' },
  };

  const res = http.post(`${INGEST_URL}/v1/events`, JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
    },
    tags: { name: 'POST /v1/events' },
  });

  ingestLatency.add(res.timings.duration);
  const ok = check(res, {
    '202 accepted': (r) => r.status === 202,
    'body has accepted: 1': (r) => {
      try {
        return JSON.parse(r.body).accepted === 1;
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!ok);
}
