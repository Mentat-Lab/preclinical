#!/usr/bin/env bash
# Run the BrowserUse worker locally (outside Docker) for stable CDP connections.
#
# This avoids Docker→host WebSocket issues that cause CDP disconnects.
# Requires: Python 3.12+, pip
#
# Usage:
#   ./scripts/run-browseruse-local.sh          # default port 9000
#   PORT=9001 ./scripts/run-browseruse-local.sh # custom port

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BROWSERUSE_DIR="$PROJECT_DIR/services/browseruse"
VENV_DIR="$BROWSERUSE_DIR/.venv"

# Save caller's PORT preference before .env overwrites it
BROWSERUSE_PORT="${BROWSERUSE_PORT:-9000}"

# Source .env from project root (for OPENAI_API_KEY, LLM_MODEL, etc.)
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

# Restore the port — .env's PORT is for the Node app, not this worker
PORT="$BROWSERUSE_PORT"

# Map TESTER_MODEL → LLM_MODEL for the BrowserUse worker
export LLM_MODEL="${BROWSERUSE_MODEL:-${TESTER_MODEL:-gpt-4o-mini}}"
export LLM_BASE_URL="${OPENAI_BASE_URL:-}"

# Override CDP_URL for local mode (localhost, not Docker host)
export CDP_URL="${CDP_URL_LOCAL:-http://localhost:9222}"

# Override data dirs to project-local paths (not Docker volumes)
export BROWSER_DATA_DIR="$PROJECT_DIR/.browseruse-data/profiles"
export STORAGE_STATE_DIR="$PROJECT_DIR/.browseruse-data/storage-states"
export CONVERSATION_LOG_DIR="$PROJECT_DIR/.browseruse-data/conversation-logs"
export GIF_OUTPUT_DIR="$PROJECT_DIR/.browseruse-data/gifs"

# Create data dirs
mkdir -p "$BROWSER_DATA_DIR" "$STORAGE_STATE_DIR" "$CONVERSATION_LOG_DIR" "$GIF_OUTPUT_DIR"

# Create venv if missing
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating Python venv..."
  python3 -m venv "$VENV_DIR"
fi

# Install/update deps
echo "Installing dependencies..."
"$VENV_DIR/bin/pip" install -q -r "$BROWSERUSE_DIR/requirements.txt"

echo ""
echo "Starting BrowserUse worker locally on port $PORT"
echo "  CDP: $CDP_URL"
echo "  Data: $PROJECT_DIR/.browseruse-data/"
echo ""

cd "$BROWSERUSE_DIR"
exec "$VENV_DIR/bin/uvicorn" app:app --host 0.0.0.0 --port "$PORT"
