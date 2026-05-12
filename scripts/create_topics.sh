#!/usr/bin/env bash
# Create Kafka / Redpanda topics declared in infra/kafka/topics.yml.
# Idempotent — uses `rpk topic create --create-options` semantics.
#
# Usage:
#   ./scripts/create_topics.sh                      # uses redpanda:9092 from inside the network
#   BROKERS=localhost:19092 ./scripts/create_topics.sh   # from the host

set -euo pipefail

BROKERS="${BROKERS:-redpanda:9092}"

echo "Creating topics on ${BROKERS}..."

create_topic() {
  local name="$1"
  local partitions="$2"
  local retention_ms="$3"

  if docker compose -f infra/docker-compose.yml exec -T redpanda \
      rpk topic list -X brokers="${BROKERS}" 2>/dev/null | grep -q "^${name}\b"; then
    echo "  [skip] ${name} already exists"
    return
  fi

  docker compose -f infra/docker-compose.yml exec -T redpanda \
    rpk topic create "${name}" \
      -X brokers="${BROKERS}" \
      --partitions "${partitions}" \
      --replicas 1 \
      --config retention.ms="${retention_ms}" \
      --config compression.type=zstd
  echo "  [ok] ${name} (${partitions} partitions, retention ${retention_ms}ms)"
}

create_topic events.raw   6 604800000
create_topic events.tick  3 3600000
create_topic alerts.fired 3 2592000000

echo "Done."
