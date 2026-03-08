# Create Agent

Create a new agent configuration.

```
POST /api/v1/agents
```

## Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Display name for the agent |
| `provider` | string | Yes | Provider type (`vapi`, `openai`, `livekit`, `pipecat`, `browser`) |
| `config` | object | Yes | Provider-specific configuration |
| `description` | string | No | Agent description |

## Example

```bash
curl -X POST http://localhost:3000/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Vapi Agent",
    "provider": "vapi",
    "config": {
      "api_key": "your-vapi-api-key",
      "assistant_id": "asst_xxxxx"
    }
  }'
```

## Response (201)

Returns the full inserted agent row.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "vapi",
  "name": "My Vapi Agent",
  "description": null,
  "config": {"api_key": "...", "assistant_id": "asst_xxxxx"},
  "is_active": true,
  "created_at": "2026-01-20T10:00:00Z",
  "updated_at": "2026-01-20T10:00:00Z"
}
```

## Errors

| Status | Description |
|--------|-------------|
| `400` | `provider` and `name` are required |
