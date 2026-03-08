#!/usr/bin/env bash
# Run the Pipecat agent locally for development/testing
#
# Usage:
#   ./scripts/run_dev.sh
#
# Prerequisites:
#   1. Python 3.11+ installed
#   2. .env file at repo root with OPENAI_API_KEY and DAILY_API_KEY

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
AGENT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")/.." && pwd)"
ROOT_DIR="$(cd "${AGENT_DIR}/../.." && pwd)"

# Check for .env file
if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "Error: .env not found at repo root." >&2
  echo "Copy target-agents/pipecat/.env.example to .env and fill in your API keys." >&2
  exit 1
fi

# Load environment variables
set -a
source "${ROOT_DIR}/.env"
set +a

# Validate required environment variables
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "Error: OPENAI_API_KEY is required in .env." >&2
  exit 1
fi

# DAILY_API_KEY is required unless DAILY_ROOM_URL is provided (external room mode)
if [[ -z "${DAILY_API_KEY:-}" ]] && [[ -z "${DAILY_ROOM_URL:-}" ]]; then
  echo "Error: DAILY_API_KEY is required for local development (unless DAILY_ROOM_URL is set)." >&2
  exit 1
fi

# Change to agent directory
cd "${AGENT_DIR}"

# Create virtual environment if it doesn't exist
# Pipecat requires Python 3.10-3.13, so we prefer python3.13 or python3.12 if available
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

# Activate virtual environment
source .venv/bin/activate

# Install dependencies if needed
if [[ ! -f ".venv/.installed" ]] || [[ "requirements.txt" -nt ".venv/.installed" ]]; then
  echo "Installing dependencies..."
  pip install -q -r requirements.txt
  touch .venv/.installed
fi

echo ""
echo "Starting Pipecat agent in local development mode..."
echo "============================================================"
echo ""

# Check if we should join an external room or create one
if [[ -n "${DAILY_ROOM_URL:-}" ]]; then
  echo "External room mode: Joining ${DAILY_ROOM_URL}"
  echo ""
  # Run bot.py directly with room URL (it will pick up DAILY_ROOM_URL from env)
  python bot.py
else
  # Run the local runner (creates a new room)
  export LOCAL_RUN=1
  python local_runner.py
fi
