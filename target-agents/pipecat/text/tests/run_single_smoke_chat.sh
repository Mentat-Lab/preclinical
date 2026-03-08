#!/usr/bin/env bash
# Run a single smoke chat test against the Pipecat text agent
#
# Matches LiveKit's tests/run_single_smoke_chat.sh pattern:
#   1. Select scenario from Supabase
#   2. Install dependencies
#   3. Start agent as background process
#   4. Run smoke_chat.py with prompt
#
# Usage:
#   ./target-agents/pipecat/text/tests/run_single_smoke_chat.sh
#   ./target-agents/pipecat/text/tests/run_single_smoke_chat.sh "I have chest pain"
#   SCENARIO_ID_OVERRIDE=<uuid> ./target-agents/pipecat/text/tests/run_single_smoke_chat.sh

set -euo pipefail

# Get script location
SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
TEST_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
TEXT_DIR="$(cd "${TEST_DIR}/.." && pwd)"
PIPECAT_DIR="$(cd "${TEXT_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${PIPECAT_DIR}/../.." && pwd)"

# Load environment from repo root
if [[ -f "${ROOT_DIR}/.env" ]]; then
  set -a
  source "${ROOT_DIR}/.env"
  set +a
fi

# Handle both variable naming conventions
SUPABASE_URL_VALUE="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
SUPABASE_ANON_KEY_VALUE="${SUPABASE_ANON_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}"

# Validate required environment variables
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "Error: OPENAI_API_KEY is required." >&2
  exit 1
fi

if [[ -z "${DAILY_API_KEY:-}" ]]; then
  echo "Error: DAILY_API_KEY is required." >&2
  exit 1
fi

if [[ -z "${SUPABASE_URL_VALUE}" || -z "${SUPABASE_ANON_KEY_VALUE}" ]]; then
  echo "Missing SUPABASE_URL or SUPABASE_ANON_KEY env vars." >&2
  echo "Example: SUPABASE_URL=... SUPABASE_ANON_KEY=... $0" >&2
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

# Get initial prompt from scenario script or use arg
INITIAL_PROMPT="${1:-}"
if [[ -z "${INITIAL_PROMPT}" ]]; then
  INITIAL_PROMPT="$(echo "${SCENARIO_JSON}" | jq -r --arg id "${SCENARIO_ID}" '.[] | select(.scenario_id==$id) | .script // ""')"
fi

if [[ -z "${INITIAL_PROMPT}" ]]; then
  echo "Scenario ${SCENARIO_ID} has no initial prompt/script. Aborting." >&2
  exit 1
fi

echo "Selected scenario: ${SCENARIO_NAME} (${SCENARIO_ID})"

# Verify directory structure
if [[ ! -d "${TEXT_DIR}" ]]; then
  echo "target-agents/pipecat/text not found. Run from repo root." >&2
  exit 1
fi

echo ""
echo "Step 2: Install dependencies (if needed)..."

# Determine Python command (Pipecat requires Python 3.10-3.13)
PYTHON_CMD="python3"
if command -v python3.13 >/dev/null 2>&1; then
  PYTHON_CMD="python3.13"
elif command -v python3.12 >/dev/null 2>&1; then
  PYTHON_CMD="python3.12"
elif command -v python3.11 >/dev/null 2>&1; then
  PYTHON_CMD="python3.11"
fi

# Create virtual environment if needed
if [[ ! -d "${TEXT_DIR}/.venv" ]]; then
  echo "Creating Python virtual environment using ${PYTHON_CMD}..."
  ${PYTHON_CMD} -m venv "${TEXT_DIR}/.venv"
fi

# Activate virtual environment
source "${TEXT_DIR}/.venv/bin/activate"

# Install dependencies if needed
if [[ ! -f "${TEXT_DIR}/.venv/.installed" ]] || [[ "${TEXT_DIR}/requirements.txt" -nt "${TEXT_DIR}/.venv/.installed" ]]; then
  echo "Installing dependencies..."
  pip install -q -r "${TEXT_DIR}/requirements.txt"
  touch "${TEXT_DIR}/.venv/.installed"
else
  echo "Dependencies up to date."
fi

echo ""
echo "Step 3: Start Pipecat text agent..."

# Create a Daily room for the test
DAILY_ROOM_JSON="$(curl -sS "https://api.daily.co/v1/rooms" \
  -H "Authorization: Bearer ${DAILY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"properties": {"exp": '$(( $(date +%s) + 600 ))', "enable_chat": true}}')"

ROOM_URL="$(echo "${DAILY_ROOM_JSON}" | jq -r '.url')"
ROOM_NAME="$(echo "${DAILY_ROOM_JSON}" | jq -r '.name')"

if [[ -z "${ROOM_URL}" || "${ROOM_URL}" == "null" ]]; then
  echo "Failed to create Daily room." >&2
  echo "${DAILY_ROOM_JSON}"
  exit 1
fi

echo "Room: ${ROOM_URL}"

# Get a token for the agent
AGENT_TOKEN_JSON="$(curl -sS "https://api.daily.co/v1/meeting-tokens" \
  -H "Authorization: Bearer ${DAILY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"properties": {"room_name": "'"${ROOM_NAME}"'", "is_owner": true, "exp": '$(( $(date +%s) + 600 ))'}}')"

AGENT_TOKEN="$(echo "${AGENT_TOKEN_JSON}" | jq -r '.token')"

# Start the agent in the background
export DAILY_ROOM_URL="${ROOM_URL}"
export DAILY_ROOM_TOKEN="${AGENT_TOKEN}"

python "${TEXT_DIR}/bot.py" > /tmp/pipecat-text-agent.log 2>&1 &
AGENT_PID=$!

# Ensure cleanup on exit
cleanup() {
  if kill -0 ${AGENT_PID} 2>/dev/null; then
    kill ${AGENT_PID} 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Wait for agent to initialize
sleep 3

# Check if agent is still running
if ! kill -0 ${AGENT_PID} 2>/dev/null; then
  echo "Agent failed to start. Log output:" >&2
  cat /tmp/pipecat-text-agent.log >&2
  exit 1
fi

echo "Agent started (PID: ${AGENT_PID})"

echo ""
echo "Step 4: Run smoke chat with initial prompt..."
echo ""

# Run the smoke chat test (reuse the same room)
export DAILY_ROOM_URL="${ROOM_URL}"
# Get a separate token for the tester
TESTER_TOKEN_JSON="$(curl -sS "https://api.daily.co/v1/meeting-tokens" \
  -H "Authorization: Bearer ${DAILY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"properties": {"room_name": "'"${ROOM_NAME}"'", "user_name": "smoke-tester", "exp": '$(( $(date +%s) + 600 ))'}}')"

export DAILY_ROOM_TOKEN="$(echo "${TESTER_TOKEN_JSON}" | jq -r '.token')"

python "${TEXT_DIR}/smoke_chat.py" "${INITIAL_PROMPT}"
EXIT_CODE=$?

echo ""
echo "Done."

exit ${EXIT_CODE}
