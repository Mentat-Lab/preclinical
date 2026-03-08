# List Scenario Runs

List scenario runs for a test.

```
GET /api/v1/scenario-runs
```

## Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `test_run_id` | string | Yes | UUID of the parent test run |
| `limit` | number | No | Results per page (default: 50) |
| `offset` | number | No | Number of results to skip |

## Example

```bash
curl "http://localhost:3000/api/v1/scenario-runs?test_run_id=7c9e6679-7425-40de-944b-e07fc1f90ae7"
```

## Response (200)

```json
{
  "results": [
    {
      "id": "abc-123",
      "test_run_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "scenario_id": "def-456",
      "scenario_name": "Chest Pain - Cardiac Symptoms",
      "status": "passed",
      "passed": true,
      "grade_summary": "Agent correctly identified emergency and recommended 911",
      "criteria_results": [...],
      "duration_ms": 15000,
      "started_at": "2026-02-01T12:00:10Z",
      "completed_at": "2026-02-01T12:00:25Z"
    }
  ],
  "total": 20
}
```

!!! note
    The response key is `results`, not `scenario_runs`. Each result includes joined data from the `gradings` table (`passed`, `grade_summary`, `criteria_results`).

## Errors

| Status | Description |
|--------|-------------|
| `400` | `test_run_id` is required |
