#!/usr/bin/env bash
# Preclinical health check — runs on SessionStart to verify infra is ready.
# Outputs warnings to stderr (shown to user). Exits 0 always (non-blocking).

set -euo pipefail

warnings=()
has_anything=false

# Check Docker
if ! command -v docker &>/dev/null; then
  warnings+=("Docker is not installed — required for self-hosting Preclinical")
elif ! docker compose ps --format json &>/dev/null 2>&1; then
  warnings+=("Docker Compose services are not running")
else
  running=$(docker compose ps --format json 2>/dev/null | grep -c '"running"' || true)
  if [ "$running" -gt 0 ]; then
    has_anything=true
  else
    warnings+=("Docker Compose services are not running")
  fi
fi

# Check CLI
if ! command -v preclinical &>/dev/null; then
  warnings+=("Preclinical CLI not found (pipx install preclinical)")
else
  has_anything=true
  # Check server connection (quick, 3s timeout)
  if ! timeout 3 preclinical health --json &>/dev/null 2>&1; then
    warnings+=("Preclinical server not reachable")
  fi
fi

# Report
if [ ${#warnings[@]} -gt 0 ]; then
  echo "" >&2
  if [ "$has_anything" = false ]; then
    echo "[preclinical] First time? Run /preclinical:setup to get started." >&2
  else
    echo "[preclinical] Setup issues detected:" >&2
    for w in "${warnings[@]}"; do
      echo "  - $w" >&2
    done
    echo "  Run /preclinical:setup to fix." >&2
  fi
  echo "" >&2
fi

exit 0
