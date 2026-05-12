// k6 load test for the dashboard read path.
//
// Hits /api/workspaces/:wsId/events/kpi behind a JWT — proves the BFF
// + Redis cache + ClickHouse aggregation chain holds p95 < 500ms under
// concurrent read load.
//
// Usage:
//   k6 run -e API_URL=http://localhost:4000 \
//          -e EMAIL=loadtest@example.com \
//          -e PASSWORD=loadtest-password \
//          tests/load/dashboard.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:4000';
const EMAIL = __ENV.EMAIL || '';
const PASSWORD = __ENV.PASSWORD || '';

const METRICS = ['mrr', 'dau', 'signups', 'churn', 'payments'];

export const kpiLatency = new Trend('kpi_latency_ms', true);

export const options = {
  scenarios: {
    dashboard: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '2m', target: 100 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{name:GET /events/kpi}': ['p(95)<500'],
    'http_req_failed': ['rate<0.02'],
  },
};

export function setup() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Set EMAIL and PASSWORD env (a real seeded workspace user).');
  }
  const res = http.post(
    `${API_URL}/api/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'content-type': 'application/json' } },
  );
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${res.body}`);
  const body = JSON.parse(res.body);
  return { token: body.tokens.accessToken, workspaceId: body.workspace.id };
}

export default function (data) {
  const metric = METRICS[Math.floor(Math.random() * METRICS.length)];
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
  const qs = new URLSearchParams({
    metric,
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const res = http.get(
    `${API_URL}/api/workspaces/${data.workspaceId}/events/kpi?${qs.toString()}`,
    {
      headers: { authorization: `Bearer ${data.token}` },
      tags: { name: 'GET /events/kpi' },
    },
  );
  kpiLatency.add(res.timings.duration);
  check(res, { 'kpi 200': (r) => r.status === 200 });
  sleep(0.2);
}
