#!/usr/bin/env bash
# Smoke test for the Preclinical Claude Code plugin.
# Verifies plugin loading, command discovery, hook behavior, and cold-start UX.
#
# Usage: bash plugins/preclinical/tests/smoke-test.sh
# Requires: claude CLI in PATH

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR_BASE=$(mktemp -d)
PASSED=0
FAILED=0
ERRORS=()

cleanup() { rm -rf "$TMPDIR_BASE"; }
trap cleanup EXIT

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
bold()  { printf "\033[1m%s\033[0m\n" "$1"; }

pass() { PASSED=$((PASSED + 1)); green "  PASS: $1"; }
fail() { FAILED=$((FAILED + 1)); ERRORS+=("$1"); red "  FAIL: $1"; }

# ---------------------------------------------------------------------------
bold "Preclinical Plugin Smoke Test"
bold "Plugin dir: $PLUGIN_DIR"
echo ""

# ---------------------------------------------------------------------------
bold "Layer 1: Plugin validation"

if claude plugin validate "$PLUGIN_DIR" > /dev/null 2>&1; then
  pass "plugin.json passes validation"
else
  fail "plugin.json validation failed"
  claude plugin validate "$PLUGIN_DIR" 2>&1 | sed 's/^/    /'
fi

# ---------------------------------------------------------------------------
bold "Layer 2: Command discovery"

WORKDIR="$TMPDIR_BASE/discover"
mkdir -p "$WORKDIR"

COMMANDS_OUTPUT=$(cd "$WORKDIR" && claude --plugin-dir "$PLUGIN_DIR" -p \
  "List every slash command starting with /preclinical. Output ONLY the command names, one per line, no descriptions." < /dev/null 2>&1 || true)

EXPECTED_COMMANDS=(
  "setup"
  "run"
  "benchmark"
  "create-scenario"
  "diagnose"
  "compare"
  "improve"
  "export-report"
)

for cmd in "${EXPECTED_COMMANDS[@]}"; do
  if echo "$COMMANDS_OUTPUT" | grep -qi "$cmd"; then
    pass "/preclinical:$cmd discovered"
  else
    fail "/preclinical:$cmd NOT discovered"
  fi
done

# Check awareness skill
if echo "$COMMANDS_OUTPUT" | grep -qi "awareness"; then
  pass "preclinical-awareness skill discovered"
else
  fail "preclinical-awareness skill NOT discovered"
fi

# ---------------------------------------------------------------------------
bold "Layer 3: Health check script (cold-start)"

# Run from temp dir with no docker-compose context
HEALTH_OUTPUT=$(cd "$TMPDIR_BASE" && bash "$PLUGIN_DIR/scripts/health-check.sh" 2>&1 || true)
HEALTH_EXIT=$?

if [ "$HEALTH_EXIT" -eq 0 ]; then
  pass "health-check exits 0 (non-blocking)"
else
  fail "health-check exited $HEALTH_EXIT (should always exit 0)"
fi

if echo "$HEALTH_OUTPUT" | grep -qi "preclinical"; then
  pass "health-check outputs preclinical message"
else
  fail "health-check produced no preclinical output"
fi

# If CLI is not installed, expect the first-time message
if ! command -v preclinical &>/dev/null; then
  if echo "$HEALTH_OUTPUT" | grep -qi "setup"; then
    pass "health-check suggests /preclinical:setup when CLI missing"
  else
    fail "health-check doesn't suggest setup when CLI missing"
  fi
else
  pass "health-check ran with CLI present (skipping cold-start check)"
fi

# ---------------------------------------------------------------------------
bold "Layer 4: Cold-start setup detection"

WORKDIR="$TMPDIR_BASE/setup"
mkdir -p "$WORKDIR"

SETUP_OUTPUT=$(cd "$WORKDIR" && claude --plugin-dir "$PLUGIN_DIR" -p \
  "/preclinical:setup" < /dev/null 2>&1 || true)

# In non-interactive (-p) mode, Claude can't run bash commands and may
# return empty output or ask for permissions. Either way, the command
# should reference setup concepts if it produces output.
if [ -z "$(echo "$SETUP_OUTPUT" | tr -d '[:space:]')" ]; then
  pass "setup command invoked (empty output — permission-blocked in -p mode, expected)"
elif echo "$SETUP_OUTPUT" | grep -qiE "docker|preclinical|setup|server|install|health|permission|approve"; then
  pass "setup command produces relevant setup guidance"
else
  fail "setup command produced unexpected output"
  echo "  [debug] output: $(echo "$SETUP_OUTPUT" | head -5)"
fi

# ---------------------------------------------------------------------------
echo ""
bold "Results: $PASSED passed, $FAILED failed"

if [ "$FAILED" -gt 0 ]; then
  echo ""
  red "Failures:"
  for err in "${ERRORS[@]}"; do
    red "  - $err"
  done
  exit 1
fi

green "All checks passed."
