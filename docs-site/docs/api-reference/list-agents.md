# List Agents

List all configured agents.

```
GET /api/v1/agents
```

No query parameters are supported. Returns all non-deleted agents.

## Example

```bash
curl "http://localhost:3000/api/v1/agents"
```

## Response (200)

Returns a bare JSON array (not wrapped in an object):

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "vapi",
    "name": "My Vapi Agent",
    "description": null,
    "config": {...},
    "is_active": true,
    "created_at": "2026-01-20T10:00:00Z",
    "updated_at": "2026-01-20T10:00:00Z"
  }
]
```

!!! note
    Unlike other list endpoints, this returns a plain array, not `{ agents: [...], total }`.
