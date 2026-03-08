# Delete Scenario

Soft-delete a scenario by setting it as inactive.

```
DELETE /api/v1/scenarios/{id}
```

## Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | UUID of the scenario |

## Example

```bash
curl -X DELETE http://localhost:3000/api/v1/scenarios/def-456
```

## Response (204)

No content. The scenario is marked as inactive and will no longer appear in listings or be selected for test runs.

## Errors

| Status | Description |
|--------|-------------|
| `404` | Scenario not found |
