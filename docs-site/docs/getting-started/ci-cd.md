# CI/CD Integration

Integrate Preclinical into your CI/CD pipeline to automatically test your AI agents before deployment.

## Overview

Running Preclinical tests in CI/CD allows you to:

- Catch regressions before they reach production
- Enforce quality gates based on pass rates
- Track agent performance over time
- Block deployments that don't meet safety standards

## Using the Python SDK (Recommended)

The simplest approach uses the [Python CLI/SDK](cli.md):

```yaml
name: AI Agent Safety Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Install Preclinical CLI
        run: pip install preclinical

      - name: Run Safety Tests
        env:
          PRECLINICAL_API_URL: ${{ secrets.PRECLINICAL_URL }}
          PRECLINICAL_API_KEY: ${{ secrets.PRECLINICAL_API_KEY }}
        run: |
          RESULT=$(preclinical run ${{ secrets.PRECLINICAL_AGENT_ID }} \
            --name "CI: ${{ github.sha }}" \
            --concurrency 3 \
            --json)

          PASS_RATE=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('pass_rate', 0))")
          echo "Pass rate: ${PASS_RATE}%"

          if [ $(echo "$PASS_RATE < 80" | bc -l) -eq 1 ]; then
            echo "::error::Pass rate ${PASS_RATE}% is below 80% threshold"
            preclinical results list $(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])") --json
            exit 1
          fi
```

Or use the SDK directly in a Python script for more control:

```python
# scripts/ci_test.py
import sys
from preclinical import Preclinical

client = Preclinical()
run = client.run(
    agent_id=sys.argv[1],
    name=f"CI: {sys.argv[2]}",
    concurrency_limit=3,
)

print(f"Pass rate: {run.pass_rate}%")

for r in client.results(run.id):
    status = "PASS" if r.passed else "FAIL"
    print(f"  [{status}] {r.scenario_name}")

if run.pass_rate < 80:
    sys.exit(1)
```

## Using curl (Alternative)

If you prefer not to install the Python CLI, you can use the REST API directly.

## GitHub Actions

### Basic Example

Create `.github/workflows/preclinical.yml`:

```yaml
name: AI Agent Testing

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Run Preclinical Tests
        env:
          PRECLINICAL_URL: ${{ secrets.PRECLINICAL_URL }}
          AGENT_ID: ${{ secrets.PRECLINICAL_AGENT_ID }}
        run: |
          # Start test run
          RESPONSE=$(curl -s -X POST "$PRECLINICAL_URL/start-run" \
            -H "Content-Type: application/json" \
            -d "{\"agent_id\": \"$AGENT_ID\"}")

          RUN_ID=$(echo $RESPONSE | jq -r '.id')
          echo "Started test run: $RUN_ID"

          # Poll for completion
          while true; do
            STATUS_RESPONSE=$(curl -s "$PRECLINICAL_URL/api/v1/tests/$RUN_ID")

            STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')
            PASS_RATE=$(echo $STATUS_RESPONSE | jq -r '.pass_rate // 0')

            echo "Status: $STATUS, Pass Rate: $PASS_RATE%"

            if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ] || [ "$STATUS" = "canceled" ]; then
              break
            fi

            sleep 10
          done

          # Check pass rate threshold
          THRESHOLD=80
          if [ $(echo "$PASS_RATE < $THRESHOLD" | bc -l) -eq 1 ]; then
            echo "Pass rate ($PASS_RATE%) is below threshold ($THRESHOLD%)"
            exit 1
          fi

          echo "Pass rate ($PASS_RATE%) meets threshold ($THRESHOLD%)"
```

### With Reusable Script

Create `scripts/run-preclinical-tests.sh`:

```bash
#!/bin/bash
set -e

BASE_URL=${PRECLINICAL_URL:?Preclinical URL required}
AGENT_ID=${1:?Agent ID required}
THRESHOLD=${2:-80}

echo "Starting Preclinical test run..."

# Start test run
RESPONSE=$(curl -s -X POST "$BASE_URL/start-run" \
  -H "Content-Type: application/json" \
  -d "{\"agent_id\": \"$AGENT_ID\"}")

RUN_ID=$(echo $RESPONSE | jq -r '.id')

if [ "$RUN_ID" = "null" ]; then
  echo "Failed to start test run"
  echo $RESPONSE | jq
  exit 1
fi

echo "Test run started: $RUN_ID"

# Poll for completion
while true; do
  RESULT=$(curl -s "$BASE_URL/api/v1/tests/$RUN_ID")

  STATUS=$(echo $RESULT | jq -r '.status')
  PASS_RATE=$(echo $RESULT | jq -r '.pass_rate // 0')
  PASSED=$(echo $RESULT | jq -r '.passed_count // 0')
  TOTAL=$(echo $RESULT | jq -r '.total_scenarios // 0')

  echo "  Status: $STATUS | Passed: $PASSED/$TOTAL | Pass Rate: $PASS_RATE%"

  case $STATUS in
    completed|failed|canceled)
      break
      ;;
  esac

  sleep 10
done

# Check threshold
if [ $(echo "$PASS_RATE < $THRESHOLD" | bc -l) -eq 1 ]; then
  echo "FAILED: Pass rate below threshold"
  exit 1
fi

echo "PASSED: All quality gates met"
```

Then use it in your workflow:

```yaml
name: AI Agent Testing

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Preclinical Tests
        run: ./scripts/run-preclinical-tests.sh ${{ secrets.PRECLINICAL_AGENT_ID }} 85
        env:
          PRECLINICAL_URL: ${{ secrets.PRECLINICAL_URL }}
```

## GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - test

preclinical-test:
  stage: test
  image: alpine:latest
  before_script:
    - apk add --no-cache curl jq bc
  script:
    - |
      RESPONSE=$(curl -s -X POST "$PRECLINICAL_URL/start-run" \
        -H "Content-Type: application/json" \
        -d "{\"agent_id\": \"$AGENT_ID\"}")

      RUN_ID=$(echo $RESPONSE | jq -r '.id')
      echo "Started test run: $RUN_ID"

      while true; do
        RESULT=$(curl -s "$PRECLINICAL_URL/api/v1/tests/$RUN_ID")

        STATUS=$(echo $RESULT | jq -r '.status')
        PASS_RATE=$(echo $RESULT | jq -r '.pass_rate // 0')

        echo "Status: $STATUS, Pass Rate: $PASS_RATE%"

        if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
          break
        fi

        sleep 10
      done

      if [ $(echo "$PASS_RATE < 80" | bc -l) -eq 1 ]; then
        echo "Pass rate below threshold"
        exit 1
      fi
  variables:
    PRECLINICAL_URL: $PRECLINICAL_URL
    AGENT_ID: $PRECLINICAL_AGENT_ID
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PRECLINICAL_URL` | Base URL of your self-hosted instance |
| `PRECLINICAL_AGENT_ID` | UUID of the agent to test |

## Quality Gates

Example threshold configurations:

| Environment | Threshold | Rationale |
|-------------|-----------|-----------|
| PR checks | 75% | Quick validation |
| Staging | 85% | Pre-production gate |
| Production | 90% | High safety standard |

## Troubleshooting

### Tests Timing Out

Increase the timeout in your CI configuration or use the SSE endpoint (`GET /events?run_id=xxx`) for real-time status instead of polling.

### Rate Limiting

If you see 429 errors, add delays between API calls or reduce concurrent test runs.

### Pass Rate Fluctuations

AI agents can have variable behavior. Consider:

- Running multiple test iterations
- Using rolling averages
- Setting slightly lower thresholds with manual review for borderline results
