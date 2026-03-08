# Get Agent

Get agent details.

```
GET /api/v1/agents/{id}
```

## Example

```bash
curl "http://localhost:3000/api/v1/agents/550e8400-e29b-41d4-a716-446655440000"
```

## Response (200)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "vapi",
  "name": "My Vapi Agent",
  "description": "Production triage assistant",
  "config": {
    "assistant_id": "asst_xxxxx",
    "api_key": "..."
  },
  "is_active": true,
  "created_at": "2026-01-20T10:00:00Z",
  "updated_at": "2026-01-20T10:00:00Z"
}
```

## Errors

| Status | Description |
|--------|-------------|
| `404` | Agent not found |
