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

- **Library type drift quietly breaks the build months later.** Six months
  after the api/ image last compiled cleanly, a fresh `docker compose up`
  failed at `npm run build` with four TS errors. Puppeteer v23 now returns
  `Uint8Array` from `page.pdf()` instead of `Buffer`; `@types/node` v22
  made `Buffer` a generic that no longer satisfies `BodyInit` directly;
  Prisma's `InputJsonValue` tightened so `AlertChannelDto[]` needs an
  `as unknown as` bridge. None of these are real bugs — they're upstream
  type-tightening that compounds across pinned-major-version installs.
  Lesson: pin minor versions too, or run a weekly green-build CI even on
  branches you aren't actively touching.
- **Module-level `export const` ordering can silently mis-wire NestJS DI.**
  `PdfModule` defined `export const PDF_QUEUE = 'pdf-render'` *below* the
  imports of `PdfService` and `PdfRenderProcessor`. Decorators evaluate at
  import time, so `@InjectQueue(PDF_QUEUE)` and `@Processor(PDF_QUEUE)`
  ran with `undefined`, which `@nestjs/bullmq` cheerfully aliases to
  `'default'`. Then `BullModule.registerQueue({ name: PDF_QUEUE })`
  evaluated last and registered the queue under `'pdf-render'`. Result:
  `Nest can't resolve dependencies of the PdfService (?, ...) — BullQueue_default`.
  Fix: put shared module constants in their own file (`pdf.constants.ts`)
  so import-time evaluation is total.
- **aiokafka 0.11 swapped compression backends from per-codec libs to
  cramjam.** Producing with `compression_type="zstd"` raised
  `RuntimeError: Compression library for zstd not found` even with
  `zstandard==0.23.0` installed. `aiokafka.codec.has_zstd()` now returns
  `cramjam is not None`. The pinned aiokafka was 0.11.0, the unpinned
  `zstandard` transitive was a moot dependency. Lesson: when a Python
  library claims an optional codec, audit which package its current
  detector actually imports.
- **Healthcheck commands must exist in the image they run inside.** The
  compose file shipped `wget`-based healthchecks for every service, but
  the python:3.11-slim base only installs `curl`. Forecast and ingestion
  reported "unhealthy" forever — not because they were broken, but
  because the test command was `not found`. The consumer's
  `pgrep -f` healthcheck had the same problem (slim doesn't include
  `procps`). Either standardise on `curl` for HTTP probes and install
  `procps` in slim images, or pick `alpine` everywhere — but don't mix.
- **Next.js standalone in Docker binds only to the container's external
  interface.** With default `HOSTNAME`, the standalone server logs
  `Network: http://172.x.x.x:3000` but `127.0.0.1:3000` inside the
  container is connection-refused. A wget healthcheck pointed at
  localhost will always fail. Set `ENV HOSTNAME=0.0.0.0` in the runtime
  stage so loopback is bound too.
- **Caddy's default admin endpoint is `localhost:2019`, and inside Alpine
  + BusyBox wget that doesn't always resolve to where Caddy listens.**
  The healthcheck got "Connection refused" even though Caddy logged
  `admin endpoint started`. Pinning `admin :2019` in the global block
  binds it on all interfaces (still safe: port not published to host)
  and makes the healthcheck deterministic.
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
- **`PDF_QUEUE` lives in `api/src/pdf/pdf.constants.ts` for a reason.**
  Do not move it back into `pdf.module.ts` even though the module is
  "where queues are registered" — see the import-time evaluation lesson
  above. Re-inlining the constant will silently mis-wire BullMQ injection
  again, and the failure mode is "service won't start in production"
  rather than a compile error.
- **Frontend `public/` must exist on disk even if empty.** The Dockerfile
  does `COPY --from=build /app/public ./public` unconditionally; without
  a placeholder (`.gitkeep`) the build fails at "not found." Don't be
  tempted to delete `frontend/public/` if it looks empty.
