# ADR-002 — Kafka (Redpanda) over Redis Streams

- **Status:** Accepted
- **Date:** 2026-05-12
- **Deciders:** Md. Rakib
- **Supersedes:** —
- **Superseded by:** —

## Context

InsightFlow needs a buffer between event ingest and ClickHouse writes for three reasons: (1) absorb short bursts so the ClickHouse insert path can micro-batch, (2) decouple producer SLA from consumer SLA, and (3) allow re-processing from offset zero when we add a new materialized view or fix a bug in the enrichment pipeline.

Two realistic options:

- **Apache Kafka** (via Redpanda for dev, Bitnami Kafka image for prod) — gold-standard durable log, replayable, partitioned for parallel consumers.
- **Redis Streams** — already in the stack for cache and pub/sub, has consumer groups and replay via XREAD, much lighter to operate.

## Decision

We use **Kafka semantics, served by Redpanda** as a single-binary broker in dev and demo. The Apache Kafka image is documented as the production swap-in.

## Why

- **Replayability is non-negotiable.** When we add `mv_cohort_daily` after launch, we need to backfill from the existing event stream — that means consuming from offset 0 of `events.raw`. Redis Streams supports this via the `0` ID, but in practice persistence-to-disk semantics on Redis are weaker (depends on `appendfsync` settings) and we'd be one OOM kill from data loss.
- **Partitioning by `workspace_id`** — Kafka's partition key gives us per-tenant ordering and lets us scale consumer parallelism per workspace. Redis Streams has no equivalent; you'd have to shard at the application layer.
- **Operational story past v1.** If InsightFlow ever serves more than one production tenant, a real Kafka cluster is a known-good answer. There's no equivalent "production-grade Redis Streams cluster" story we'd trust.
- **Redpanda specifically** because it's a single binary (no JVM, no Zookeeper, KRaft mode), runs comfortably on a 4 GB box for the demo, and is wire-compatible with Kafka clients. That keeps the dev story trivial without committing to a different protocol.

## Trade-offs

- **Heavier to operate than Redis Streams.** Mitigated in v1 by using Redpanda single-node — one container, no cluster coordination.
- **Two persistence layers** (Redis for cache/pubsub + Redpanda for the durable log). Acceptable because their jobs are genuinely different and we'd want both in production anyway.

## Consequences

- Topics declared in `infra/kafka/topics.yml`: `events.raw` (durable, partition key = `workspace_id`), `events.tick` (ephemeral, for WebSocket UI ticks).
- Ingestion REST and the Kafka consumer are the only producers; the consumer is the only writer to ClickHouse.
- Production deployment path documented in `infra/README.md`: swap the Redpanda service for `bitnami/kafka` in KRaft mode without changing client code.
