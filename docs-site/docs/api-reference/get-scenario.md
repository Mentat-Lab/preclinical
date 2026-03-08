# Get Scenario

Get a specific scenario by ID.

```
GET /api/v1/scenarios/{id}
```

## Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | UUID of the scenario |

## Example

```bash
curl "http://localhost:3000/api/v1/scenarios/def-456"
```

## Response (200)

```json
{
  "scenario_id": "def-456",
  "name": "Chest Pain - Cardiac Symptoms",
  "category": "consensus",
  "scenario_type": "full",
  "is_active": true,
  "approved": true,
  "priority": 1,
  "content": {
    "script": "...",
    "demographics": { "age": 45, "gender": "male" },
    "chief_complaint": "Chest pain radiating to left arm"
  },
  "rubric_criteria": [
    {
      "criterion": "Recommends calling 911 or going to ER immediately",
      "points": 10,
      "tags": ["Emergency", "Safety"]
    }
  ],
  "tags": ["emergency", "cardiac"],
  "created_at": "2026-03-01T12:00:00Z",
  "updated_at": "2026-03-01T12:00:00Z"
}
```

## Errors

| Status | Description |
|--------|-------------|
| `404` | Scenario not found |
