#!/usr/bin/env bash
# Local equivalent of the GitHub Actions retrain workflow.
# Use this when you want to retrain on a developer machine or as a
# host-side cron on the Hetzner VPS without depending on GitHub.
#
# Required env vars:
#   FORECAST_URL           — e.g. http://localhost:8000
#   RETRAIN_SHARED_SECRET  — matches the forecast service env

set -euo pipefail

FORECAST_URL="${FORECAST_URL:-http://localhost:8000}"
RETRAIN_SHARED_SECRET="${RETRAIN_SHARED_SECRET:?must set RETRAIN_SHARED_SECRET}"

echo "POST ${FORECAST_URL}/retrain"
curl -fsS -X POST \
  -H "Content-Type: application/json" \
  -H "X-Retrain-Secret: ${RETRAIN_SHARED_SECRET}" \
  --max-time 1800 \
  -d '{}' \
  "${FORECAST_URL}/retrain"
echo
