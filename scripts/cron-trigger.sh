#!/bin/bash
# ─────────────────────────────────────────────────────────────
# C-2: Railway Cron trigger script
#
# Deployed as separate Railway Cron Services (one per job schedule).
# Each service runs this script, which curls the monolith's cron
# endpoint and exits — Railway handles the scheduling.
#
# Required env vars (set on each Railway Cron Service):
#   APP_URL              — base URL of the main service
#   ENGINE_CRON_SECRET   — shared secret (must match main service)
#
# Usage:
#   bash scripts/cron-trigger.sh <job_id>
#
# Example Railway Cron Service config:
#   Start Command: bash scripts/cron-trigger.sh inbox_scan
#   Cron Schedule: 30 */2 * * *
# ─────────────────────────────────────────────────────────────
set -euo pipefail

JOB_ID="${1:?Usage: cron-trigger.sh <job_id>}"
APP_URL="${APP_URL:?APP_URL env var not set}"
ENGINE_CRON_SECRET="${ENGINE_CRON_SECRET:?ENGINE_CRON_SECRET env var not set}"

ENDPOINT="${APP_URL}/api/engine/cron/${JOB_ID}"
echo "[cron] Triggering ${JOB_ID} → ${ENDPOINT}"

# POST with 120s timeout (morning_assembly can take ~45s, add margin)
HTTP_CODE=$(curl -s -o /tmp/cron-response.json -w "%{http_code}" \
  -X POST "${ENDPOINT}" \
  -H "Authorization: Bearer ${ENGINE_CRON_SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 120)

BODY=$(cat /tmp/cron-response.json 2>/dev/null || echo '{}')

if [ "$HTTP_CODE" -eq 200 ]; then
  echo "[cron] ✅ ${JOB_ID} succeeded: ${BODY}"
  exit 0
else
  echo "[cron] ❌ ${JOB_ID} failed (HTTP ${HTTP_CODE}): ${BODY}" >&2
  exit 1
fi
