#!/usr/bin/env bash
# Nightly backup: ClickHouse + Postgres + MinIO bucket.
#
# Drops dumps in /var/backups/insightflow/<YYYY-MM-DD>/ and keeps the
# last 14 days. Copy them off-box (rsync, B2, S3) at least weekly —
# this script intentionally does NOT push to off-box storage so the
# host can't leak credentials if compromised.

set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/insightflow}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STACK_DIR="${STACK_DIR:-/home/insightflow/InsightFlow-Real-Time-Business-Analytics-with-Ml}"
COMPOSE="docker compose -f ${STACK_DIR}/infra/docker-compose.yml"

today="$(date -u +%Y-%m-%d)"
target="${BACKUP_ROOT}/${today}"
mkdir -p "${target}"

echo "[$(date -u +%H:%M:%SZ)] postgres dump"
${COMPOSE} exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-insightflow}" \
  -d "${POSTGRES_DB:-insightflow}" \
  -F c -Z 6 \
  > "${target}/postgres.dump"

echo "[$(date -u +%H:%M:%SZ)] clickhouse dump"
${COMPOSE} exec -T clickhouse sh -c 'clickhouse-client --query "BACKUP DATABASE insightflow TO Disk(\"backups\", \"insightflow_'${today}'.zip\")"' \
  || echo "  warn: clickhouse BACKUP failed — falling back to file copy"
# Fallback: tar the data dir while service is up (consistency depends
# on no concurrent merges; the BACKUP statement above is preferred).
${COMPOSE} exec -T clickhouse sh -c "cd /var/lib/clickhouse && tar czf - data metadata" \
  > "${target}/clickhouse-data.tar.gz" || true

echo "[$(date -u +%H:%M:%SZ)] minio mirror"
${COMPOSE} exec -T minio sh -c "mc alias set local http://localhost:9000 \${MINIO_ROOT_USER} \${MINIO_ROOT_PASSWORD} >/dev/null && mc mirror --overwrite local/${S3_BUCKET_PDF:-insightflow-pdf} /tmp/pdf-mirror && tar czf - -C /tmp/pdf-mirror ." \
  > "${target}/minio-pdf.tar.gz" || echo "  warn: minio mirror skipped (bucket may be empty)"

echo "[$(date -u +%H:%M:%SZ)] pruning > ${KEEP_DAYS} days"
find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime "+${KEEP_DAYS}" -exec rm -rf {} +

echo "[$(date -u +%H:%M:%SZ)] done — ${target}"
du -sh "${target}"
