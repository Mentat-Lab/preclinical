#!/usr/bin/env bash
set -euo pipefail

SUPABASE_URL_VALUE="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
SUPABASE_ANON_KEY_VALUE="${SUPABASE_ANON_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}"

if [[ -z "${SUPABASE_URL_VALUE}" || -z "${SUPABASE_ANON_KEY_VALUE}" ]]; then
  echo "Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars." >&2
  echo "Example: SUPABASE_URL=... SUPABASE_ANON_KEY=... $0" >&2
  exit 1
fi

if [[ -z "${LIVEKIT_URL:-}" || -z "${LIVEKIT_API_KEY:-}" || -z "${LIVEKIT_API_SECRET:-}" ]]; then
  echo "Missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET env vars." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. Please install jq and retry." >&2
  exit 1
fi

REST_URL="${SUPABASE_URL_VALUE}/rest/v1"
API_KEY="${SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_ANON_KEY_VALUE}}}"

SCENARIO_ID="${SCENARIO_ID_OVERRIDE:-}"

echo "Step 1: Select scenario..."
if [[ -n "${SCENARIO_ID}" ]]; then
  SCENARIO_JSON="$(curl -sS "${REST_URL}/scenarios?select=scenario_id,name,script&scenario_id=eq.${SCENARIO_ID}&limit=1" \
    -H "apikey: ${API_KEY}" \
    -H "Authorization: Bearer ${API_KEY}")"
  SCENARIO_NAME="$(echo "${SCENARIO_JSON}" | jq -r '.[0].name // empty')"
  SCENARIO_ID="$(echo "${SCENARIO_JSON}" | jq -r '.[0].scenario_id // empty')"
else
  SCENARIO_JSON="$(curl -sS "${REST_URL}/scenarios?select=scenario_id,name,script" \
    -H "apikey: ${API_KEY}" \
    -H "Authorization: Bearer ${API_KEY}")"
  if command -v shuf >/dev/null 2>&1; then
    SCENARIO_ID="$(echo "${SCENARIO_JSON}" | jq -r '.[].scenario_id' | shuf -n 1)"
  else
    SCENARIO_ID="$(echo "${SCENARIO_JSON}" | jq -r '.[].scenario_id' | awk 'BEGIN{srand()} {ids[NR]=$0} END{if (NR>0) print ids[int(rand()*NR)+1]}')"
  fi
  SCENARIO_NAME="$(echo "${SCENARIO_JSON}" | jq -r --arg id "${SCENARIO_ID}" '.[] | select(.scenario_id==$id) | .name' | head -n 1)"
fi

if [[ -z "${SCENARIO_ID}" || -z "${SCENARIO_NAME}" ]]; then
  echo "Scenario not found." >&2
  echo "${SCENARIO_JSON}" | jq -c '.'
  exit 1
fi

INITIAL_PROMPT="$(echo "${SCENARIO_JSON}" | jq -r --arg id "${SCENARIO_ID}" '.[] | select(.scenario_id==$id) | .script // ""')"
if [[ -z "${INITIAL_PROMPT}" ]]; then
  echo "Scenario ${SCENARIO_ID} has no initial prompt/context. Aborting." >&2
  exit 1
fi

echo "Selected scenario: ${SCENARIO_NAME} (${SCENARIO_ID})"

if [[ ! -d target-agents/livekit/voice ]]; then
  echo "target-agents/livekit/voice not found. Run from repo root." >&2
  exit 1
fi

echo "Step 2: Install LiveKit agent dependencies (if needed)..."
( cd target-agents/livekit/voice && npm install )

echo "Step 3: Start LiveKit agent..."
node target-agents/livekit/voice/index.js dev > /tmp/livekit-voice-agent.log 2>&1 &
AGENT_PID=$!
trap 'kill ${AGENT_PID} >/dev/null 2>&1 || true' EXIT
sleep 2

echo "Step 4: Run smoke chat with initial prompt..."
node target-agents/livekit/voice/smoke_chat.js "${INITIAL_PROMPT}"

echo "Done."
