# Update Agent

Update an existing agent's configuration.

```
PATCH /api/v1/agents/{id}
```

## Request Body

All fields are optional. Only provided fields are updated.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Display name |
| `config` | object | Provider-specific configuration |
| `description` | string | Agent description |

## Example

```bash
curl -X PATCH "http://localhost:3000/api/v1/agents/550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Agent Name",
    "config": {
      "api_key": "new-api-key",
      "assistant_id": "asst_new"
    }
  }'
```

## Response (200)

Returns the full updated agent row.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "vapi",
  "name": "Updated Agent Name",
  "is_active": true,
  "updated_at": "2026-01-21T10:00:00Z"
}
```

## Errors

| Status | Description |
|--------|-------------|
| `404` | Agent not found |
