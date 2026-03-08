#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-}"

if [[ -z "${MODE}" || ("${MODE}" != "dev" && "${MODE}" != "docker") ]]; then
  echo "Usage: $0 <dev|docker>" >&2
  exit 1
fi

if [[ "${MODE}" == "dev" ]]; then
  if ! command -v livekit-server >/dev/null 2>&1; then
    echo "livekit-server not found. Install it first:" >&2
    echo "  macOS: brew install livekit" >&2
    echo "  Linux: curl -sSL https://get.livekit.io | bash" >&2
    exit 1
  fi
  exec livekit-server --dev
fi

# Docker mode
if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for docker mode." >&2
  exit 1
fi

LIVEKIT_KEYS_VALUE="${LIVEKIT_KEYS:-}"
if [[ -z "${LIVEKIT_KEYS_VALUE}" ]]; then
  if [[ -n "${LIVEKIT_API_KEY:-}" && -n "${LIVEKIT_API_SECRET:-}" ]]; then
    LIVEKIT_KEYS_VALUE="${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}"
  fi
fi

if [[ -z "${LIVEKIT_KEYS_VALUE}" ]]; then
  echo "Provide LIVEKIT_KEYS or LIVEKIT_API_KEY + LIVEKIT_API_SECRET." >&2
  exit 1
fi

LIVEKIT_NODE_IP_VALUE="${LIVEKIT_NODE_IP:-127.0.0.1}"

exec docker run --rm -it \
  -e LIVEKIT_KEYS="${LIVEKIT_KEYS_VALUE}" \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  livekit/livekit-server \
  --node-ip "${LIVEKIT_NODE_IP_VALUE}"
