# API Reference

The Preclinical API enables programmatic access to test execution and results.

## Base URL

Most endpoints are under `/api/v1`. Some operational endpoints (`/start-run`, `/cancel-run`) are at the root.

```
http://localhost:3000
```

!!! note
    Port 3000 is the default when running via Docker Compose. If running the server directly in development (`npm run dev`), the default port is 8000.

## Authentication

The self-hosted version has no authentication by default. All endpoints are open.

## Endpoints

### Tests

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/start-run` | [Start a new test](start-test.md) |
| `GET` | `/api/v1/tests` | [List all tests](list-tests.md) |
| `GET` | `/api/v1/tests/{id}` | [Get test status and summary](get-test.md) |
| `POST` | `/cancel-run` | [Cancel an in-progress test](cancel-test.md) |

### Scenario Runs

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/scenario-runs` | [List scenario runs for a test](list-scenario-runs.md) |
| `GET` | `/api/v1/scenario-runs/{id}` | [Get detailed scenario with transcript](scenario-runs.md) |

### Scenarios

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/scenarios` | [List scenarios](list-scenarios.md) |
| `GET` | `/api/v1/scenarios/{id}` | [Get scenario details](get-scenario.md) |
| `PATCH` | `/api/v1/scenarios/{id}` | [Update a scenario](update-scenario.md) |
| `DELETE` | `/api/v1/scenarios/{id}` | [Delete a scenario](delete-scenario.md) |
| `POST` | `/api/v1/scenarios/generate` | [Generate scenario from clinical text](generate-scenario.md) |
| `POST` | `/api/v1/scenarios/generate-batch` | [Generate scenarios from document](generate-batch.md) |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/agents` | [List all agents](list-agents.md) |
| `POST` | `/api/v1/agents` | [Create a new agent](create-agent.md) |
| `GET` | `/api/v1/agents/{id}` | [Get agent details](get-agent.md) |
| `PATCH` | `/api/v1/agents/{id}` | [Update an agent](update-agent.md) |
| `DELETE` | `/api/v1/agents/{id}` | [Delete an agent](delete-agent.md) |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/events?run_id=xxx` | SSE stream for real-time updates |

## Response Format

All responses are JSON. Successful responses return the requested data directly:

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "status": "completed",
  "pass_rate": 85.0
}
```

## Error Responses

```json
{
  "error": "Agent not found"
}
```

### HTTP Status Codes

| Status | Description |
|--------|-------------|
| `200` | Success |
| `201` | Created |
| `204` | No Content (successful deletion) |
| `400` | Bad Request |
| `404` | Not Found |
| `500` | Server Error |

## Pagination

The `GET /api/v1/tests` and `GET /api/v1/scenario-runs` endpoints support `limit` and `offset` query parameters.

```bash
curl "http://localhost:3000/api/v1/tests?limit=20&offset=20"
```

## Quick Start Example

```bash
# Start a test
RESPONSE=$(curl -s -X POST http://localhost:3000/start-run \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "your-agent-uuid"}')

TEST_ID=$(echo $RESPONSE | jq -r '.id')

# Poll for completion
while true; do
  STATUS=$(curl -s "http://localhost:3000/api/v1/tests/$TEST_ID" | jq -r '.status')

  echo "Status: $STATUS"

  if [ "$STATUS" = "completed" ] || [ "$STATUS" = "failed" ]; then
    break
  fi

  sleep 5
done

# Get scenario run details
curl -s "http://localhost:3000/api/v1/scenario-runs?test_run_id=$TEST_ID" | jq
```
