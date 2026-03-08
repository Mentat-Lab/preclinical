# Cancel Test

Cancel an in-progress test run.

```
POST /cancel-run
```

## Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `test_run_id` | string | Yes | UUID of the test run to cancel |

## Example

```bash
curl -X POST http://localhost:3000/cancel-run \
  -H "Content-Type: application/json" \
  -d '{"test_run_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7"}'
```

## Response (200)

```json
{
  "status": "canceled",
  "canceled_scenarios": 12
}
```

If the run is already completed or failed:

```json
{
  "status": "completed",
  "message": "Test run already finalized"
}
```

## Errors

| Status | Description |
|--------|-------------|
| `400` | `test_run_id` is required |
| `404` | Test run not found |
