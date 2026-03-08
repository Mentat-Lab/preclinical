# Start Test

Start a new test run to evaluate an AI agent.

```
POST /start-run
```

## Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_id` | string | Yes | UUID of the agent to test |
| `name` | string | No | Custom name for this run |
| `test_suite_id` | string | No | UUID of a test suite to run |
| `scenario_ids` | string[] | No | Specific scenario IDs to run |
| `max_scenarios` | number | No | Limit number of scenarios |
| `max_turns` | number | No | Max conversation turns per scenario (clamped to 5-7) |
| `concurrency_limit` | number | No | Max parallel executions (default: 6) |

If none of `test_suite_id`, `scenario_ids`, or `max_scenarios` are provided, all active approved scenarios are run.

## Example

```bash
curl -X POST http://localhost:3000/start-run \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "550e8400-e29b-41d4-a716-446655440000",
    "max_scenarios": 5,
    "max_turns": 6
  }'
```

## Response (200)

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "test_run_id": "run_20260301120000_abc1",
  "status": "running",
  "total_scenarios": 5,
  "scenarios_launched": 5
}
```

## Errors

| Status | Description |
|--------|-------------|
| `400` | `agent_id` is required |
| `400` | Agent not found or inactive |
| `400` | Unsupported provider |
| `400` | No active scenarios available |
| `404` | Test suite not found |
