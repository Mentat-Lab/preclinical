# Update Scenario

Update an existing scenario's fields.

```
PATCH /api/v1/scenarios/{id}
```

## Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | UUID of the scenario |

## Request Body

All fields are optional. Only provided fields are updated.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Scenario name |
| `category` | string | Scenario category |
| `scenario_type` | string | `full`, `demo`, or `custom` |
| `is_active` | boolean | Whether the scenario is active |
| `approved` | boolean | Whether the scenario is approved |
| `priority` | number | Priority for selection ordering |
| `content` | object | Scenario content (script, demographics, chief_complaint) |
| `rubric_criteria` | array | Rubric criteria array |
| `tags` | string[] | Classification tags |

## Example

```bash
curl -X PATCH http://localhost:3000/api/v1/scenarios/def-456 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Scenario Name",
    "priority": 5,
    "tags": ["emergency", "cardiac", "critical"]
  }'
```

## Response (200)

Returns the updated scenario object.

## Errors

| Status | Description |
|--------|-------------|
| `404` | Scenario not found |
