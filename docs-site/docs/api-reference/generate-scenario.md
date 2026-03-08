# Generate Scenario

Generate a structured test scenario from clinical text (SOP, guideline, protocol). Uses the tester LLM to extract patient demographics, chief complaint, and rubric criteria.

```
POST /api/v1/scenarios/generate
```

## Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Clinical text to generate a scenario from |
| `category` | string | No | Scenario category |
| `name` | string | No | Scenario name |

## Example

```bash
curl -X POST http://localhost:3000/api/v1/scenarios/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "If a patient presents with chest pain radiating to the left arm, immediately recommend calling 911...",
    "category": "emergency",
    "name": "Chest Pain Protocol"
  }'
```

## Response (201)

Returns the inserted scenario row.

## Errors

| Status | Description |
|--------|-------------|
| `400` | `text` is required and must be a non-empty string |
| `400` | `category` must be a string |
| `500` | Scenario generation failed (LLM or DB error) |
