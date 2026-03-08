#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
ROOT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")/../../../.." && pwd)"
AGENT_DIR="${ROOT_DIR}/target-agents/livekit/voice"
MODE="${1:-}"

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo ".env not found at repo root." >&2
  exit 1
fi

set -a
source "${ROOT_DIR}/.env"
set +a

if [[ -z "${LIVEKIT_URL:-}" || -z "${LIVEKIT_API_KEY:-}" || -z "${LIVEKIT_API_SECRET:-}" ]]; then
  echo "LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET are required for local deploy." >&2
  exit 1
fi

echo "Starting local LiveKit voice agent + server via Docker..."
if [[ "${MODE}" == "detach" || "${MODE}" == "--detach" || "${MODE}" == "-d" ]]; then
  docker compose --env-file "${ROOT_DIR}/.env" -f "${AGENT_DIR}/docker-compose.yml" up --build -d
else
  docker compose --env-file "${ROOT_DIR}/.env" -f "${AGENT_DIR}/docker-compose.yml" up --build
fi
