#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]:-$0}"
ROOT_DIR="$(cd "$(dirname "${SCRIPT_PATH}")/../../../.." && pwd)"

if ! command -v lk >/dev/null 2>&1; then
  echo "LiveKit CLI (lk) not found. Install it first." >&2
  exit 1
fi

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo ".env not found at repo root." >&2
  exit 1
fi

set -a
source "${ROOT_DIR}/.env"
set +a

if [[ -z "${OPENAI_API_KEY:-}" || -z "${OPENAI_BASE_URL:-}" ]]; then
  echo "OPENAI_API_KEY and OPENAI_BASE_URL are required in .env." >&2
  exit 1
fi

AGENT_DIR="${ROOT_DIR}/target-agents/livekit/voice"

echo "Deploying LiveKit voice agent from ${AGENT_DIR}"
echo "Project: preclinical"

script -q /dev/null lk agent deploy \
  --project preclinical \
  "${AGENT_DIR}" \
  --secrets "OPENAI_API_KEY=${OPENAI_API_KEY}" \
  --secrets "OPENAI_BASE_URL=${OPENAI_BASE_URL}"
