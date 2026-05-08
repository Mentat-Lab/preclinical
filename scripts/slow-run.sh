#!/usr/bin/env bash
# =============================================================================
# slow-run.sh — Drip-feed scenarios one at a time with random delays
#
# Designed to avoid bot detection by randomizing intervals between 1-10 minutes.
# Enqueues one pg-boss job, waits for it to complete, sleeps random interval, repeat.
#
# Usage:
#   ./scripts/slow-run.sh <test_run_id> <agent_id>
# =============================================================================

set -euo pipefail

TEST_RUN_ID="${1:?Usage: slow-run.sh <test_run_id> <agent_id>}"
AGENT_ID="${2:?Usage: slow-run.sh <test_run_id> <agent_id>}"
DB_CMD="docker compose exec -T db psql -U postgres -d preclinical -t -A"

echo "=== Slow Run: $TEST_RUN_ID ==="
echo "Agent: $AGENT_ID"
echo "Strategy: 1 scenario at a time, random 1-10 min delay between"
echo ""

completed=0
errors=0
consecutive_errors=0

while true; do
  # Get next pending scenario
  NEXT=$($DB_CMD -c "
    SELECT sr.id || '|' || sr.scenario_id FROM scenario_runs sr
    WHERE sr.test_run_id = '$TEST_RUN_ID' AND sr.status = 'pending'
    ORDER BY random() LIMIT 1;")

  if [ -z "$NEXT" ]; then
    echo "$(date +%H:%M:%S) | No more pending scenarios. Done!"
    break
  fi

  SR_ID=$(echo "$NEXT" | cut -d'|' -f1)
  SC_ID=$(echo "$NEXT" | cut -d'|' -f2)
  SC_NAME=$($DB_CMD -c "SELECT name FROM scenarios WHERE scenario_id = '$SC_ID';")

  echo "$(date +%H:%M:%S) | Starting: $SC_NAME"

  # Enqueue single job
  $DB_CMD -c "
    INSERT INTO pgboss.job (id, name, data, state, retry_limit, retry_count, expire_seconds, created_on, start_after, priority, group_id)
    VALUES (gen_random_uuid(), 'run-scenario',
      '{\"test_run_id\":\"$TEST_RUN_ID\",\"scenario_run_id\":\"$SR_ID\",\"scenario_id\":\"$SC_ID\",\"agent_id\":\"$AGENT_ID\",\"agent_type\":\"browser\",\"max_turns\":11,\"benchmark_mode\":false,\"creative_mode\":false,\"grading_mode\":\"intent\"}'::jsonb,
      'created', 3, 0, 900, NOW(), NOW(), 0, '$TEST_RUN_ID');" > /dev/null

  # Wait for this scenario to complete
  while true; do
    STATUS=$($DB_CMD -c "SELECT status FROM scenario_runs WHERE id = '$SR_ID';")
    if [[ "$STATUS" != "pending" && "$STATUS" != "running" && "$STATUS" != "grading" ]]; then
      break
    fi
    sleep 15
  done

  completed=$((completed + 1))

  if [ "$STATUS" = "error" ]; then
    errors=$((errors + 1))
    consecutive_errors=$((consecutive_errors + 1))
    echo "$(date +%H:%M:%S) | ERROR ($consecutive_errors consecutive): $SC_NAME"

    if [ "$consecutive_errors" -ge 5 ]; then
      echo "$(date +%H:%M:%S) | 5 CONSECUTIVE ERRORS — STOPPING"
      $DB_CMD -c "UPDATE test_runs SET status = 'canceled' WHERE id = '$TEST_RUN_ID';" > /dev/null
      break
    fi
  else
    consecutive_errors=0
    echo "$(date +%H:%M:%S) | $STATUS: $SC_NAME ($completed done, $errors errors)"
  fi

  # Random delay 1-10 minutes (60-600 seconds)
  DELAY=$(( (RANDOM % 540) + 60 ))
  REMAINING=$($DB_CMD -c "SELECT COUNT(*) FROM scenario_runs WHERE test_run_id = '$TEST_RUN_ID' AND status = 'pending';")
  echo "$(date +%H:%M:%S) | Sleeping ${DELAY}s (~$((DELAY/60))min) before next. $REMAINING remaining."
  sleep "$DELAY"
done

# Finalize
$DB_CMD -c "
UPDATE test_runs SET
  status = CASE WHEN (SELECT COUNT(*) FROM scenario_runs WHERE test_run_id = '$TEST_RUN_ID' AND status = 'pending') = 0 THEN 'completed' ELSE status END,
  completed_at = NOW(),
  passed_count = (SELECT COUNT(*) FROM scenario_runs WHERE test_run_id = '$TEST_RUN_ID' AND status = 'passed'),
  failed_count = (SELECT COUNT(*) FROM scenario_runs WHERE test_run_id = '$TEST_RUN_ID' AND status = 'failed'),
  error_count = (SELECT COUNT(*) FROM scenario_runs WHERE test_run_id = '$TEST_RUN_ID' AND status = 'error')
WHERE id = '$TEST_RUN_ID';" > /dev/null

echo ""
echo "=== FINAL ==="
$DB_CMD -c "SELECT status, COUNT(*) FROM scenario_runs WHERE test_run_id = '$TEST_RUN_ID' GROUP BY status;"
