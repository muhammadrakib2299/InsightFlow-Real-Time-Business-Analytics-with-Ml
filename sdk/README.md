# sdk — `insightflow-js`

Tiny TypeScript client for sending events to the InsightFlow ingestion API.

```ts
import { InsightFlow } from 'insightflow-js';

const client = new InsightFlow({
  apiKey: process.env.IF_KEY!,
  host: 'http://localhost:4000',
});

await client.track('order_completed', { value: 49.0, currency: 'USD', plan: 'pro' });
await client.identify('user_123', { plan: 'pro', signup_date: '2026-04-01' });
client.page(); // implicit URL + referrer
```

**Features**

- `track(event, properties)`, `identify(userId, traits)`, `page()`
- Async batching (max 20 events or 2 s flush, whichever first)
- Exponential backoff on 5xx with jitter
- ESM + CJS bundles, type definitions included
- Zero runtime dependencies

Not published to npm in v1 — `npm link` from the monorepo or import via workspace alias.
