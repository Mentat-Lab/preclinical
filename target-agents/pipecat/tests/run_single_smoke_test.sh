#!/usr/bin/env bash
# Run a single smoke test against the Pipecat agent
#
# Usage:
#   ./tests/run_single_smoke_test.sh
#   ./tests/run_single_smoke_test.sh "Custom prompt"
#   SCENARIO_ID_OVERRIDE=<uuid> ./tests/run_single_smoke_test.sh
#
# This script:
#   1. Loads environment from repo root
#   2. Picks a random scenario from Supabase (or uses override)
#   3. Creates a Daily room for testing
#   4. Starts the agent
#   5. Runs the smoke test

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
TEST_DIR="$(cd "$(dirname "${SCRIPT_PATH}")" && pwd)"
AGENT_DIR="$(cd "${TEST_DIR}/.." && pwd)"
ROOT_DIR="$(cd "${AGENT_DIR}/../.." && pwd)"

# Load environment
if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "Error: .env not found at repo root." >&2
  exit 1
fi

set -a
source "${ROOT_DIR}/.env"
set +a

# Validate required environment variables
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "Error: OPENAI_API_KEY is required." >&2
  exit 1
fi

if [[ -z "${DAILY_API_KEY:-}" ]]; then
  echo "Error: DAILY_API_KEY is required." >&2
  exit 1
fi

# Get prompt (from argument or Supabase scenario)
PROMPT="${1:-}"

if [[ -z "${PROMPT}" ]]; then
  if [[ -n "${SCENARIO_ID_OVERRIDE:-}" ]]; then
    echo "Using scenario ID override: ${SCENARIO_ID_OVERRIDE}"
    SCENARIO_ID="${SCENARIO_ID_OVERRIDE}"
  else
    echo "Fetching random scenario from Supabase..."

    if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
      echo "Warning: Supabase not configured. Using default test prompt." >&2
      PROMPT="Hello, I need to schedule an appointment for a checkup."
    else
      # Fetch a random scenario
      SCENARIO=$(curl -s \
        "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/scenarios?select=id,content&limit=1&order=random()" \
        -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
        -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}")

      if [[ -z "${SCENARIO}" || "${SCENARIO}" == "[]" ]]; then
        echo "Warning: No scenarios found. Using default test prompt." >&2
        PROMPT="Hello, I need to schedule an appointment for a checkup."
      else
        PROMPT=$(echo "${SCENARIO}" | python3 -c "import sys,json; s=json.load(sys.stdin); print(s[0]['content'].get('initial_prompt', 'Hello') if s else 'Hello')" 2>/dev/null || echo "Hello, I need help with scheduling.")
        SCENARIO_ID=$(echo "${SCENARIO}" | python3 -c "import sys,json; s=json.load(sys.stdin); print(s[0]['id'] if s else '')" 2>/dev/null || echo "")
        echo "Using scenario: ${SCENARIO_ID:-unknown}"
      fi
    fi
  fi
fi

echo ""
echo "============================================================"
echo "Pipecat Agent Smoke Test"
echo "============================================================"
echo ""
echo "Prompt: ${PROMPT}"
echo ""

# Change to agent directory
cd "${AGENT_DIR}"

# Ensure virtual environment exists
# Pipecat requires Python 3.10-3.13
PYTHON_CMD="python3"
if command -v python3.13 >/dev/null 2>&1; then
  PYTHON_CMD="python3.13"
elif command -v python3.12 >/dev/null 2>&1; then
  PYTHON_CMD="python3.12"
fi

if [[ ! -d ".venv" ]]; then
  echo "Creating Python virtual environment using ${PYTHON_CMD}..."
  ${PYTHON_CMD} -m venv .venv
fi

source .venv/bin/activate

# Install dependencies if needed
if [[ ! -f ".venv/.installed" ]] || [[ "requirements.txt" -nt ".venv/.installed" ]]; then
  echo "Installing dependencies..."
  pip install -q -r requirements.txt
  touch .venv/.installed
fi

# Run the smoke test
python tests/smoke_test.py "${PROMPT}"
