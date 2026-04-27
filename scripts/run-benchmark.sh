#!/usr/bin/env bash
# =============================================================================
# run-benchmark.sh — Run TriageBench scenarios against target agents
#
# Usage:
#   ./scripts/run-benchmark.sh                         # all 60 scenarios, all targets if within browser session limit
#   ./scripts/run-benchmark.sh --sample                 # 6 sample scenarios (1,2,21,22,41,42)
#   ./scripts/run-benchmark.sh --scenarios ID1,ID2,...   # specific scenario UUIDs
#   ./scripts/run-benchmark.sh --targets category1      # API model targets
#   ./scripts/run-benchmark.sh --targets category2      # ChatGPT, Claude AI, Gemini web
#   ./scripts/run-benchmark.sh --targets category3      # PranaDoc, Doctronic, One Medical
#   ./scripts/run-benchmark.sh --targets api            # alias for category1
#   ./scripts/run-benchmark.sh --targets browser        # all browser targets
#   ./scripts/run-benchmark.sh --grading intent         # intent-based grading (default)
#   ./scripts/run-benchmark.sh --grading descriptive    # full rubric grading
#   ./scripts/run-benchmark.sh --concurrency 3          # parallel scenarios per run (default: 3)
#   ./scripts/run-benchmark.sh --browser-target-parallelism 3
#   ./scripts/run-benchmark.sh --wait                   # block until all runs complete
#
# Browser agents require profile_id in their agent config for authenticated
# sites. Set profile_id via the UI or API before running browser benchmarks:
#   curl -X PATCH http://localhost:3333/api/v1/agents/<id> \
#     -H 'Content-Type: application/json' \
#     -d '{"config":{"url":"https://chatgpt.com","profile_id":"prof_xxx"}}'
#
# Environment:
#   PRECLINICAL_API_URL   API base URL (default: http://localhost:3333)
# =============================================================================

set -euo pipefail

API_BASE="${PRECLINICAL_API_URL:-http://localhost:3333}"
GRADING_MODE="intent"
TARGET_FILTER="all"
SCENARIO_MODE="all"
CUSTOM_SCENARIOS=""
CONCURRENCY=3
BROWSER_TARGET_PARALLELISM="${BROWSER_TARGET_PARALLELISM:-3}"
MAX_TURNS=11
WAIT=false

# Sample scenario IDs (TB-001, TB-002, TB-021, TB-022, TB-041, TB-042)
SAMPLE_SCENARIOS='["147bd94f-2af2-58b3-a1a7-c3d7316d7d49","aeb23b4f-10d3-5173-8135-0d2c497c4f7d","90ca910c-3456-588b-b1e6-1e273bc49d0a","c3fedfd2-a13c-549b-83df-05b82ab0ed18","32af53f2-fc4d-5436-8e46-cac65f38be28","269cd205-8eff-54d1-8c29-f18cc33a48bf"]'

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --sample)       SCENARIO_MODE="sample"; shift ;;
    --scenarios)    SCENARIO_MODE="custom"; CUSTOM_SCENARIOS="$2"; shift 2 ;;
    --targets)      TARGET_FILTER="$2"; shift 2 ;;
    --grading)      GRADING_MODE="$2"; shift 2 ;;
    --concurrency)  CONCURRENCY="$2"; shift 2 ;;
    --browser-target-parallelism) BROWSER_TARGET_PARALLELISM="$2"; shift 2 ;;
    --max-turns)    MAX_TURNS="$2"; shift 2 ;;
    --wait)         WAIT=true; shift ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
if ! curl -sf "$API_BASE/health" > /dev/null 2>&1; then
  echo "Error: Cannot reach $API_BASE — is the platform running?"
  exit 1
fi

# ---------------------------------------------------------------------------
# Resolve agents
# ---------------------------------------------------------------------------
ALL_AGENTS=$(curl -sf "$API_BASE/api/v1/agents")
API_AGENTS=$(echo "$ALL_AGENTS" | jq -c '[.[] | select(.provider == "openai" and .is_active == true and .deleted_at == null) | {id, name, provider, has_profile: false}]')
BROWSER_AGENTS=$(echo "$ALL_AGENTS" | jq -c '[.[] | select(.provider == "browser" and .is_active == true and .deleted_at == null) | {id, name, provider, has_profile: ((.config.profile_id // "") != "")}]')
CATEGORY2_AGENTS=$(echo "$BROWSER_AGENTS" | jq -c '[.[] | select(.name == "ChatGPT" or .name == "Claude AI" or .name == "Gemini")]')
CATEGORY3_AGENTS=$(echo "$BROWSER_AGENTS" | jq -c '[.[] | select(.name == "PranaDoc" or .name == "Doctronic" or .name == "One Medical")]')

case "$TARGET_FILTER" in
  api|category1) AGENTS="$API_AGENTS" ;;
  category2)     AGENTS="$CATEGORY2_AGENTS" ;;
  category3)     AGENTS="$CATEGORY3_AGENTS" ;;
  browser)       AGENTS="$BROWSER_AGENTS" ;;
  all)     AGENTS=$(echo "$API_AGENTS $BROWSER_AGENTS" | jq -sc 'add') ;;
  *)       echo "Invalid --targets: $TARGET_FILTER (use category1, category2, category3, api, browser, or all)"; exit 1 ;;
esac

AGENT_COUNT=$(echo "$AGENTS" | jq 'length')
if [[ "$AGENT_COUNT" -eq 0 ]]; then
  echo "No agents found for filter: $TARGET_FILTER"
  exit 1
fi

BROWSER_SELECTED_COUNT=$(echo "$AGENTS" | jq '[.[] | select(.provider == "browser")] | length')
if [[ "$BROWSER_SELECTED_COUNT" -gt "$BROWSER_TARGET_PARALLELISM" ]]; then
  echo "Error: selected $BROWSER_SELECTED_COUNT browser targets, but BrowserUse account limit is $BROWSER_TARGET_PARALLELISM active sessions."
  echo "Run browser targets by category so each chatbot gets one scenario at a time:"
  echo "  ./scripts/run-benchmark.sh --targets category2 --wait --concurrency $BROWSER_TARGET_PARALLELISM"
  echo "  ./scripts/run-benchmark.sh --targets category3 --wait --concurrency $BROWSER_TARGET_PARALLELISM"
  exit 1
fi

# ---------------------------------------------------------------------------
# Check browser agents have profile_id
# ---------------------------------------------------------------------------
BROWSER_WITHOUT_PROFILE=$(echo "$AGENTS" | jq '[.[] | select(.provider == "browser" and .has_profile == false)]')
MISSING_COUNT=$(echo "$BROWSER_WITHOUT_PROFILE" | jq 'length')
if [[ "$MISSING_COUNT" -gt 0 ]]; then
  echo "Warning: ${MISSING_COUNT} browser agent(s) missing profile_id (auth may fail):"
  echo "$BROWSER_WITHOUT_PROFILE" | jq -r '.[] | "  - \(.name) (\(.id))"'
  echo ""
  echo "Set profile_id via:"
  echo "  curl -X PATCH $API_BASE/api/v1/agents/<id> \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -d '{\"config\":{\"profile_id\":\"prof_xxx\"}}'"
  echo ""
  read -p "Continue anyway? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Build scenario payload
# ---------------------------------------------------------------------------
case "$SCENARIO_MODE" in
  sample)
    SCENARIO_PAYLOAD="\"scenario_ids\":$SAMPLE_SCENARIOS"
    echo "Scenarios: 6 sample (TB-001, TB-002, TB-021, TB-022, TB-041, TB-042)"
    ;;
  custom)
    IDS_JSON=$(echo "$CUSTOM_SCENARIOS" | tr ',' '\n' | jq -R . | jq -sc .)
    SCENARIO_PAYLOAD="\"scenario_ids\":$IDS_JSON"
    echo "Scenarios: $(echo "$IDS_JSON" | jq 'length') custom"
    ;;
  all)
    SCENARIO_PAYLOAD="\"max_scenarios\":60"
    echo "Scenarios: all 60"
    ;;
esac

echo "Targets:     $AGENT_COUNT agents ($TARGET_FILTER)"
echo "Grading:     $GRADING_MODE"
echo "Max turns:   $MAX_TURNS"
echo "Concurrency: $CONCURRENCY"
if [[ "$BROWSER_SELECTED_COUNT" -gt 0 ]]; then
  echo "Browser mode: one scenario per chatbot target; up to $BROWSER_SELECTED_COUNT browser targets in parallel"
fi
echo ""

# ---------------------------------------------------------------------------
# Launch runs
# ---------------------------------------------------------------------------
declare -a RUN_IDS
declare -a RUN_NAMES

for i in $(seq 0 $((AGENT_COUNT - 1))); do
  AGENT_ID=$(echo "$AGENTS" | jq -r ".[$i].id")
  AGENT_NAME=$(echo "$AGENTS" | jq -r ".[$i].name")
  PROVIDER=$(echo "$AGENTS" | jq -r ".[$i].provider")

  # Browser agents get lower default concurrency (rate limits, session cost)
  RUN_CONCURRENCY=$CONCURRENCY
  if [[ "$PROVIDER" == "browser" && "$CONCURRENCY" -gt 1 ]]; then
    RUN_CONCURRENCY=1
  fi

  BODY="{\"agent_id\":\"$AGENT_ID\",\"name\":\"Benchmark: $AGENT_NAME\",$SCENARIO_PAYLOAD,\"grading_mode\":\"$GRADING_MODE\",\"max_turns\":$MAX_TURNS,\"concurrency_limit\":$RUN_CONCURRENCY}"

  RESULT=$(curl -sf "$API_BASE/start-run" -H 'Content-Type: application/json' -d "$BODY")
  RUN_ID=$(echo "$RESULT" | jq -r '.id')
  TOTAL=$(echo "$RESULT" | jq -r '.total_scenarios')

  RUN_IDS+=("$RUN_ID")
  RUN_NAMES+=("$AGENT_NAME")
  printf "  Started: %-20s %d scenarios  (concurrency=%d)\n" "$AGENT_NAME" "$TOTAL" "$RUN_CONCURRENCY"
done

echo ""
echo "${#RUN_IDS[@]} runs launched."

# ---------------------------------------------------------------------------
# Wait for completion and print results
# ---------------------------------------------------------------------------
if [ "$WAIT" = false ]; then
  echo ""
  echo "Run IDs:"
  for i in "${!RUN_IDS[@]}"; do
    echo "  ${RUN_NAMES[$i]}: ${RUN_IDS[$i]}"
  done
  echo ""
  echo "Rerun with --wait to block until completion, or check progress at $API_BASE"
  exit 0
fi

echo ""
echo "Waiting for all runs to complete..."

POLL_INTERVAL=10
LAST_STATUS=""
while true; do
  ALL_DONE=true
  STATUS_LINE=""
  for i in "${!RUN_IDS[@]}"; do
    DATA=$(curl -sf "$API_BASE/api/v1/tests/${RUN_IDS[$i]}")
    STATUS=$(echo "$DATA" | jq -r '.status')
    PASSED=$(echo "$DATA" | jq -r '.passed_count')
    FAILED=$(echo "$DATA" | jq -r '.failed_count')
    ERRORS=$(echo "$DATA" | jq -r '.error_count')
    TOTAL=$(echo "$DATA" | jq -r '.total_scenarios')
    DONE=$((PASSED + FAILED + ERRORS))
    STATUS_LINE+="  ${RUN_NAMES[$i]}: ${DONE}/${TOTAL} (${STATUS})\n"
    if [[ "$STATUS" == "running" || "$STATUS" == "pending" ]]; then
      ALL_DONE=false
    fi
  done

  # Only print if status changed
  if [[ "$STATUS_LINE" != "$LAST_STATUS" ]]; then
    echo -e "$STATUS_LINE"
    LAST_STATUS="$STATUS_LINE"
  fi

  if [ "$ALL_DONE" = true ]; then
    break
  fi
  sleep "$POLL_INTERVAL"
done

# ---------------------------------------------------------------------------
# Results table
# ---------------------------------------------------------------------------
echo ""
echo "================================================================================"
echo "  BENCHMARK RESULTS"
echo "================================================================================"
echo ""
printf "%-22s  %6s %6s %6s %6s   %8s\n" "Agent" "Pass" "Fail" "Error" "Total" "Rate"
printf "%-22s  %6s %6s %6s %6s   %8s\n" "----------------------" "------" "------" "------" "------" "--------"

TOTAL_PASSED=0
TOTAL_FAILED=0
TOTAL_ERRORS=0

for i in "${!RUN_IDS[@]}"; do
  DATA=$(curl -sf "$API_BASE/api/v1/tests/${RUN_IDS[$i]}")
  NAME="${RUN_NAMES[$i]}"
  PASSED=$(echo "$DATA" | jq -r '.passed_count')
  FAILED=$(echo "$DATA" | jq -r '.failed_count')
  ERRORS=$(echo "$DATA" | jq -r '.error_count')
  TOTAL=$(echo "$DATA" | jq -r '.total_scenarios')

  # Rate = passed / (passed + failed), excluding errors
  GRADED=$((PASSED + FAILED))
  if [[ "$GRADED" -gt 0 ]]; then
    RATE=$(echo "scale=1; $PASSED * 100 / $GRADED" | bc)
  else
    RATE="N/A"
  fi

  ERROR_NOTE=""
  if [[ "$ERRORS" -gt 0 ]]; then
    ERROR_NOTE="*"
  fi

  printf "%-22s  %6d %6d %6d %6d   %7s%%${ERROR_NOTE}\n" "$NAME" "$PASSED" "$FAILED" "$ERRORS" "$TOTAL" "$RATE"

  TOTAL_PASSED=$((TOTAL_PASSED + PASSED))
  TOTAL_FAILED=$((TOTAL_FAILED + FAILED))
  TOTAL_ERRORS=$((TOTAL_ERRORS + ERRORS))
done

# Overall
OVERALL_GRADED=$((TOTAL_PASSED + TOTAL_FAILED))
if [[ "$OVERALL_GRADED" -gt 0 ]]; then
  OVERALL_RATE=$(echo "scale=1; $TOTAL_PASSED * 100 / $OVERALL_GRADED" | bc)
else
  OVERALL_RATE="N/A"
fi
OVERALL_TOTAL=$((TOTAL_PASSED + TOTAL_FAILED + TOTAL_ERRORS))

echo ""
printf "%-22s  %6d %6d %6d %6d   %7s%%\n" "OVERALL" "$TOTAL_PASSED" "$TOTAL_FAILED" "$TOTAL_ERRORS" "$OVERALL_TOTAL" "$OVERALL_RATE"

if [[ "$TOTAL_ERRORS" -gt 0 ]]; then
  echo ""
  echo "* Pass rate excludes errored scenarios (network failures, rate limits, etc.)"
fi

# ---------------------------------------------------------------------------
# Download CSVs
# ---------------------------------------------------------------------------
OUTPUT_DIR="benchmark-results/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo ""
echo "Downloading CSVs to $OUTPUT_DIR/ ..."
for i in "${!RUN_IDS[@]}"; do
  SAFE_NAME=$(echo "${RUN_NAMES[$i]}" | tr ' ' '_' | tr -cd 'a-zA-Z0-9_-')
  OUTFILE="$OUTPUT_DIR/${SAFE_NAME}.csv"
  curl -sf "$API_BASE/api/v1/tests/${RUN_IDS[$i]}/export-csv" -o "$OUTFILE"
  echo "  $OUTFILE"
done

# ---------------------------------------------------------------------------
# Per-target analysis (confusion matrix, precision/recall, triage rates)
# ---------------------------------------------------------------------------
echo ""
echo "================================================================================"
echo "  PER-TARGET ANALYSIS"
echo "================================================================================"

for i in "${!RUN_IDS[@]}"; do
  ANALYSIS=$(curl -sf "$API_BASE/api/v1/tests/${RUN_IDS[$i]}/analysis" 2>/dev/null)
  if [[ -z "$ANALYSIS" ]]; then continue; fi

  NAME=$(echo "$ANALYSIS" | jq -r '.agent_name // "Unknown"')
  ACC=$(echo "$ANALYSIS" | jq -r '.accuracy')
  OVER=$(echo "$ANALYSIS" | jq -r '.over_triage_rate')
  UNDER=$(echo "$ANALYSIS" | jq -r '.under_triage_rate')
  GRADED_N=$(echo "$ANALYSIS" | jq -r '.graded_scenarios')
  ERROR_N=$(echo "$ANALYSIS" | jq -r '.error_scenarios')

  echo ""
  echo "--- $NAME (n=$GRADED_N graded, $ERROR_N errors) ---"
  printf "  Accuracy:         %s\n" "$(echo "$ACC * 100" | bc)%"
  printf "  Over-triage rate: %s\n" "$(echo "$OVER * 100" | bc)%"
  printf "  Under-triage rate:%s\n" "$(echo "$UNDER * 100" | bc)%"

  echo ""
  echo "  Confusion Matrix (rows=reference, cols=predicted):"
  printf "  %-24s  %8s  %8s  %8s\n" "" "Emerg" "Clinic" "Home"
  for REF in "Emergency evaluation" "Clinician evaluation" "Home management"; do
    SHORT=$(echo "$REF" | cut -d' ' -f1)
    E=$(echo "$ANALYSIS" | jq -r ".confusion_matrix.matrix[\"$REF\"][\"Emergency evaluation\"]")
    C=$(echo "$ANALYSIS" | jq -r ".confusion_matrix.matrix[\"$REF\"][\"Clinician evaluation\"]")
    H=$(echo "$ANALYSIS" | jq -r ".confusion_matrix.matrix[\"$REF\"][\"Home management\"]")
    printf "  %-24s  %8s  %8s  %8s\n" "$SHORT" "$E" "$C" "$H"
  done

  echo ""
  printf "  %-24s  %10s  %10s  %10s  %10s\n" "Category" "Precision" "Recall" "F1" "Support"
  for CAT in "Emergency evaluation" "Clinician evaluation" "Home management"; do
    P=$(echo "$ANALYSIS" | jq -r ".per_category[\"$CAT\"].precision")
    R=$(echo "$ANALYSIS" | jq -r ".per_category[\"$CAT\"].recall")
    F=$(echo "$ANALYSIS" | jq -r ".per_category[\"$CAT\"].f1")
    S=$(echo "$ANALYSIS" | jq -r ".per_category[\"$CAT\"].support")
    printf "  %-24s  %10s  %10s  %10s  %10s\n" "$CAT" "$P" "$R" "$F" "$S"
  done

  # Save analysis JSON
  SAFE_NAME=$(echo "${RUN_NAMES[$i]}" | tr ' ' '_' | tr -cd 'a-zA-Z0-9_-')
  echo "$ANALYSIS" | jq . > "$OUTPUT_DIR/${SAFE_NAME}_analysis.json"
done

echo ""
echo "View details: $API_BASE"
