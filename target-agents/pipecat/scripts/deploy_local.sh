#!/usr/bin/env bash
# Deploy the Pipecat agent locally via Docker Compose
#
# Usage:
#   ./scripts/deploy_local.sh           # Run in foreground
#   ./scripts/deploy_local.sh detach    # Run in background

set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
ROOT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")/../../../.." && pwd)"
AGENT_DIR="${ROOT_DIR}/target-agents/pipecat"
MODE="${1:-}"

# Check for .env file
if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "Error: .env not found at repo root." >&2
  echo "Copy target-agents/pipecat/.env.example to .env and fill in your API keys." >&2
  exit 1
fi

# Load and validate environment variables
set -a
source "${ROOT_DIR}/.env"
set +a

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "Error: OPENAI_API_KEY is required in .env." >&2
  exit 1
fi

if [[ -z "${DAILY_API_KEY:-}" ]]; then
  echo "Error: DAILY_API_KEY is required for local deployment." >&2
  exit 1
fi

echo "Starting Pipecat agent via Docker Compose..."
echo "Check the logs for the Daily room URL to join."
echo ""

if [[ "${MODE}" == "detach" || "${MODE}" == "--detach" || "${MODE}" == "-d" ]]; then
  docker compose --env-file "${ROOT_DIR}/.env" -f "${AGENT_DIR}/docker-compose.yml" up --build -d
  echo ""
  echo "Agent started in background. View logs with:"
  echo "  docker compose -f ${AGENT_DIR}/docker-compose.yml logs -f"
else
  docker compose --env-file "${ROOT_DIR}/.env" -f "${AGENT_DIR}/docker-compose.yml" up --build
fi
