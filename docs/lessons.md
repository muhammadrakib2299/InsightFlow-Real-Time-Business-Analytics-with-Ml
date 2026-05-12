# Lessons

What surprised me during the build, and what I'd do differently next time.

## Things I'd repeat

- **Single ADR per real decision, even if it's one paragraph.** ADR-001
  through ADR-005 took an hour to write at the start of the project and
  saved me at least three "wait, why did I…" detours later. The discipline
  is to commit to the decision *and* its dropped alternative.
- **`withWorkspace()` as the single chokepoint for tenant queries.** A
  regex-guarded wrapper is uglier than a generic "scoped query" abstraction,
  but it makes the audit trivial: grep for `ch.client.query(` outside
  `common/with-workspace.ts` and you have a list of CI failures.
- **Pydantic schema as the wire contract document.** Once the ingest
  schema rejected nested properties, every downstream stage (consumer,
  ClickHouse `Map(String, String)`) could trust a uniform shape and the
  TypeScript SDK could be a thin wrapper rather than a defensive translator.
- **Refusing to load tampered model artifacts.** SHA-256 manifest +
  `joblib.load` guarded behind a hash check is cheap and removes a whole
  class of supply-chain worry from a self-hostable platform.

## Things that surprised me

- **Prophet's cmdstan compile.** First-build time on the forecast image
  is brutal (~5 minutes on a CX22). Worth caching aggressively in CI and
  worth documenting in the deploy runbook so a fresh operator doesn't
  think the box is hung.
- **ClickHouse parameterised queries are stricter than they look.** The
  `{name:Type}` syntax doesn't allow even constant expressions in the
  Type slot — the param has to be a bare literal name. This is why
  `event_name` is passed as a String param rather than concatenated even
  when the value comes from a static allowlist.
- **windowFunnel returns the highest level reached, not per-level counts.**
  Took me a debugging session to figure out why my funnel chart had
  consistently low conversion at the last step — the count is "users who
  reached EXACTLY this level," and the cumulative reached count needs a
  tail-sum on the read side.
- **k6 thresholds with constant-arrival-rate.** If you don't pre-allocate
  enough VUs for the rate, k6 silently drops arrivals rather than queuing.
  The first run showed "100% success rate" because half the requests
  never went out at all.

## Things I'd do differently

- **Cookie-based auth from day one.** Stashing tokens in localStorage was
  the fastest path to a working dashboard, but it means every M6 hardening
  conversation is "OK, what would XSS get?" An HttpOnly cookie set by a
  Next.js route handler isn't more code — it's just *different* code, and
  the right time to write it is when you write the first login form.
- **Public widget rendering on the share page.** The share token works,
  the dashboard payload renders, but the live widgets need a public-key
  flow on `/events/kpi` to avoid leaking the access token via the share
  page. v1 ships with widget metadata only; a real v2 has a per-token JWT
  that the BFF mints when verifying the share link.
- **Smaller forecast image.** The current image installs Prophet + pmdarima
  + statsmodels + sklearn + pandas at full size. A scipy/numpy slim base
  and lazy imports would cut several hundred MB and shave a couple of
  minutes off cold deploys.

## Things I deliberately punted

- **Cohort filters by country/device/plan.** The cohort + funnel BFF
  endpoints don't yet take the global filter panel's drill-down values.
  The panel is in place and the wire format is settled; plumbing the
  filter through is mechanical and lands in v1.1.
- **NeuralProphet or any DL forecaster.** Prophet + ARIMA do enough on
  the 5 demo metrics. Adding NeuralProphet means re-tuning the artifact
  registry for ~100 MB models — out of scope for a portfolio piece.
- **Multi-broker Kafka.** Redpanda single-broker handles the CX22 demo
  load (1k events/s sustained). Production fan-out is documented in
  `docs/ADR-002-kafka-vs-redis-streams.md` but not deployed.

## Things I'd warn the next person about

- **Keep `withWorkspace()` and the BFF METRICS allowlist in sync with
  the forecast service.** Both services have their own copy of the
  metrics map (`api/src/events/metrics.ts` and
  `forecast/app/services/metrics.py`). A single source of truth would
  require a build-time codegen step; for now there are tests that
  exercise both ends, and the commit hook for one should always touch
  the other.
- **MinIO sig-v4 signing is bespoke in this repo** (`api/src/pdf/s3.service.ts`).
  If you ever swap providers, double-check the canonical headers
  ordering — it's the most common source of "InvalidSignature" responses.
- **The ingest consumer commits Kafka offsets only after a successful
  ClickHouse insert.** If you ever change the consumer to batch larger,
  remember the consequence: a crash mid-batch will redeliver the entire
  batch — idempotency via ReplacingMergeTree is what makes that safe.
