#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
ROOT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")/../../../.." && pwd)"

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo ".env not found at repo root." >&2
  exit 1
fi

set -a
source "${ROOT_DIR}/.env"
set +a

if [[ -z "${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}" || -z "${SUPABASE_ANON_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}" ]]; then
  echo "Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars." >&2
  exit 1
fi

SUPABASE_URL_VALUE="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL}}"
SUPABASE_ANON_KEY_VALUE="${SUPABASE_ANON_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY}}"
API_KEY="${SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_ANON_KEY_VALUE}}}"
REST_URL="${SUPABASE_URL_VALUE}/rest/v1"
AGENT_ID="${1:-${AGENT_ID:-${INTEGRATION_ID:-${LIVEKIT_TEXT_INTEGRATION_ID:-}}}}"

if [[ -z "${AGENT_ID}" ]]; then
  echo "Provide agent id or set LIVEKIT_TEXT_INTEGRATION_ID/INTEGRATION_ID." >&2
  exit 1
fi

AGENT_JSON=$(curl -sS "${REST_URL}/agents?select=id,name,provider,org_id&id=eq.${AGENT_ID}" \
  -H "apikey: ${API_KEY}" \
  -H "Authorization: Bearer ${API_KEY}")
AGENT_NAME=$(echo "${AGENT_JSON}" | jq -r '.[0].name // empty')
AGENT_PROVIDER=$(echo "${AGENT_JSON}" | jq -r '.[0].provider // empty')
AGENT_ORG_ID=$(echo "${AGENT_JSON}" | jq -r '.[0].org_id // empty')

if [[ "${AGENT_PROVIDER}" != "livekit" ]]; then
  echo "Agent ${AGENT_ID} not found or not livekit: ${AGENT_JSON}" >&2
  exit 1
fi

COMPOSE_FILE="${ROOT_DIR}/target-agents/livekit/text/docker-compose.yml"

cleanup() {
  docker compose --env-file "${ROOT_DIR}/.env" -f "${COMPOSE_FILE}" down >/dev/null 2>&1 || true
  if [[ -n "${WORKER_PID:-}" ]]; then
    kill "${WORKER_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

# Start docker stack
"${ROOT_DIR}/target-agents/livekit/text/scripts/deploy_local.sh" detach > /tmp/livekit-text-docker.log 2>&1

for i in {1..30}; do
  if lsof -nP -iTCP:7880 -sTCP:LISTEN >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# Start local worker (Python RTC worker)
( cd "${ROOT_DIR}/workers/livekit" && pip install -r requirements.txt -q )
uvicorn app:app --host 0.0.0.0 --port 3000 --app-dir "${ROOT_DIR}/workers/livekit" > /tmp/livekit-worker.log 2>&1 &
WORKER_PID=$!
sleep 3

# Pick scenario
SCENARIO_JSON=$(curl -sS "${REST_URL}/scenarios?select=scenario_id,name&limit=1" \
  -H "apikey: ${API_KEY}" -H "Authorization: Bearer ${API_KEY}")
SCENARIO_ID=$(echo "${SCENARIO_JSON}" | jq -r '.[0].scenario_id')
SCENARIO_NAME=$(echo "${SCENARIO_JSON}" | jq -r '.[0].name')

# Create test suite
SUITE_PAYLOAD=$(jq -n --arg name "LiveKit Local Worker - ${SCENARIO_NAME}" --arg desc "Local worker smoke" --arg scenario_id "${SCENARIO_ID}" '{name:$name, description:$desc, scenario_ids:[$scenario_id]}')
SUITE_RESP=$(curl -sS "${REST_URL}/test_suites?select=id" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "apikey: ${API_KEY}" \
  -d "${SUITE_PAYLOAD}")
TEST_SUITE_ID=$(echo "${SUITE_RESP}" | jq -r '.[0].id')

# Create test run (avoid enqueueing remote worker)
RUN_DATE_PART=$(date -u +"%Y%m%d%H%M%S")
RUN_SUFFIX=$(openssl rand -hex 2)
RUN_ID="run_${RUN_DATE_PART}_${RUN_SUFFIX}"
NOW_ISO=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RUN_PAYLOAD=$(jq -n \
  --arg test_run_id "${RUN_ID}" \
  --arg test_suite_id "${TEST_SUITE_ID}" \
  --arg agent_id "${AGENT_ID}" \
  --arg agent_name "${AGENT_NAME}" \
  --arg now "${NOW_ISO}" \
  '{test_run_id:$test_run_id,test_suite_id:$test_suite_id,agent_id:$agent_id,agent_type:"livekit",agent_name:$agent_name,status:"running",total_scenarios:1,max_turns:1,concurrency_limit:1,started_at:$now,created_at:$now}')
if [[ -n "${AGENT_ORG_ID}" ]]; then
  RUN_PAYLOAD=$(echo "${RUN_PAYLOAD}" | jq --arg org_id "${AGENT_ORG_ID}" '. + {org_id:$org_id}')
fi
RUN_RESP=$(curl -sS "${REST_URL}/test_runs?select=id" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "apikey: ${API_KEY}" \
  -d "${RUN_PAYLOAD}")
TEST_RUN_ID=$(echo "${RUN_RESP}" | jq -r '.[0].id')

# Create scenario run
SCENARIO_RUN_PAYLOAD=$(jq -n --arg test_run_id "${TEST_RUN_ID}" --arg scenario_id "${SCENARIO_ID}" '{test_run_id:$test_run_id,scenario_id:$scenario_id,status:"pending"}')
SCENARIO_RUN_RESP=$(curl -sS "${REST_URL}/scenario_runs?select=id" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "apikey: ${API_KEY}" \
  -d "${SCENARIO_RUN_PAYLOAD}")
SCENARIO_RUN_ID=$(echo "${SCENARIO_RUN_RESP}" | jq -r '.[0].id')

# Invoke worker directly
WORKER_PAYLOAD=$(jq -n \
  --arg test_run_id "${TEST_RUN_ID}" \
  --arg scenario_run_id "${SCENARIO_RUN_ID}" \
  --arg scenario_id "${SCENARIO_ID}" \
  --arg agent_id "${AGENT_ID}" \
  '{test_run_id:$test_run_id,scenario_run_id:$scenario_run_id,scenario_id:$scenario_id,agent_id:$agent_id,agent_type:"livekit",max_turns:1}')

curl -sS "http://127.0.0.1:3000/run" \
  -H "Authorization: Bearer ${RTC_WORKER_TOKEN:-local-worker}" \
  -H "Content-Type: application/json" \
  -d "${WORKER_PAYLOAD}" | jq -r '.'

# Poll result
for i in {1..30}; do
  SCENARIO_RUN_JSON=$(curl -sS "${REST_URL}/scenario_runs?select=id,status,completed_at,error_message&test_run_id=eq.${TEST_RUN_ID}&limit=1" \
    -H "apikey: ${API_KEY}" -H "Authorization: Bearer ${API_KEY}")
  STATUS=$(echo "${SCENARIO_RUN_JSON}" | jq -r '.[0].status')
  echo "status=${STATUS}"
  if [[ "${STATUS}" == "passed" || "${STATUS}" == "failed" || "${STATUS}" == "error" ]]; then
    break
  fi
  sleep 5
 done
