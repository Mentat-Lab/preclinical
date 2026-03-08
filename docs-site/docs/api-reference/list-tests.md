# List Tests

List all test runs with optional filtering.

```
GET /api/v1/tests
```

## Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 25 | Results per page |
| `offset` | number | 0 | Number of results to skip |
| `status` | string | -- | Filter by status (`pending`, `running`, `completed`, `failed`, `canceled`, `scheduled`) |

## Example

```bash
curl "http://localhost:3000/api/v1/tests?limit=10&status=completed"
```

## Response (200)

```json
{
  "runs": [
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "test_run_id": "run_20260201120000_abc1",
      "status": "completed",
      "agent_name": "My Vapi Agent",
      "total_scenarios": 20,
      "passed_count": 17,
      "failed_count": 3,
      "pass_rate": 85.0,
      "created_at": "2026-02-01T12:00:00Z",
      "completed_at": "2026-02-01T12:05:00Z"
    }
  ],
  "total": 42
}
```

!!! note
    The response key is `runs`, not `tests`.
