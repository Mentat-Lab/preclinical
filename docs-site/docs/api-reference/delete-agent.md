# Delete Agent

Soft-delete an agent (sets `deleted_at` timestamp).

```
DELETE /api/v1/agents/{id}
```

## Example

```bash
curl -X DELETE "http://localhost:3000/api/v1/agents/550e8400-e29b-41d4-a716-446655440000"
```

## Response (204)

No content.

## Errors

| Status | Description |
|--------|-------------|
| `404` | Agent not found |
