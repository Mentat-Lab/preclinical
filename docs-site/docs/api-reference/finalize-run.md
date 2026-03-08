# Finalize Run

Manually finalize a test run. Computes final pass/fail counts and pass rate from scenario results. Normally called automatically when all scenarios complete, but can be invoked manually if needed.

```
POST /finalize-run
```

## Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `test_run_id` | string | Yes | The `test_run_id` of the test to finalize |

## Example

```bash
curl -X POST http://localhost:3000/finalize-run \
  -H "Content-Type: application/json" \
  -d '{"test_run_id": "run_20260301120000_abc1"}'
```

## Response (200)

```json
{
  "status": "completed",
  "passed_count": 4,
  "failed_count": 1,
  "error_count": 0,
  "pass_rate": 80.0
}
```

## Errors

| Status | Description |
|--------|-------------|
| `400` | `test_run_id` is required |
| `404` | Test run not found |
