# Get Test

Get test run status and summary.

```
GET /api/v1/tests/{id}
```

## Response (200)

Returns the full test run row:

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "test_run_id": "run_20260201120000_abc1",
  "status": "completed",
  "agent_id": "550e8400-e29b-41d4-a716-446655440000",
  "agent_name": "My Vapi Agent",
  "total_scenarios": 20,
  "passed_count": 17,
  "failed_count": 3,
  "error_count": 0,
  "pass_rate": 85.0,
  "max_turns": 6,
  "concurrency_limit": 6,
  "started_at": "2026-02-01T12:00:00Z",
  "completed_at": "2026-02-01T12:05:00Z"
}
```

### Status Values

| Status | Description |
|--------|-------------|
| `pending` | Run created, not yet started |
| `running` | Scenarios actively executing |
| `completed` | Run finished |
| `failed` | Run failed due to error |
| `canceled` | Run was canceled |
| `scheduled` | Run is scheduled for future execution |

!!! note
    There is no "grading" status at the test run level. Grading happens within individual scenario runs.

## Errors

| Status | Description |
|--------|-------------|
| `404` | Test run not found |

## Getting Detailed Results

To see per-scenario results, use the [List Scenario Runs](list-scenario-runs.md) endpoint with `test_run_id`:

```bash
curl "http://localhost:3000/api/v1/scenario-runs?test_run_id=7c9e6679-7425-40de-944b-e07fc1f90ae7"
```
