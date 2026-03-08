# List Scenarios

List all active test scenarios.

```
GET /api/v1/scenarios
```

## Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `tag` | string | Filter scenarios by tag |

## Example

```bash
curl "http://localhost:3000/api/v1/scenarios"

# Filter by tag
curl "http://localhost:3000/api/v1/scenarios?tag=emergency"
```

## Response (200)

```json
{
  "scenarios": [
    {
      "scenario_id": "def-456",
      "name": "Chest Pain - Cardiac Symptoms",
      "category": "emergency",
      "severity": "critical",
      "is_active": true,
      "content": {...},
      "rubric_criteria": [...]
    }
  ],
  "total": 5
}
```
