# Generate Scenarios (Batch)

Generate multiple structured test scenarios from a clinical document. Uses the tester LLM to extract patient demographics, chief complaints, and rubric criteria for each identified case.

```
POST /api/v1/scenarios/generate-batch
```

## Request Body

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Clinical text (SOP, guideline, protocol) to generate scenarios from |
| `category` | string | No | Category to assign to all generated scenarios |
| `tags` | string[] | No | Tags to assign to all generated scenarios |

## Example

```bash
curl -X POST http://localhost:3000/api/v1/scenarios/generate-batch \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Emergency triage protocol: For chest pain with cardiac symptoms, immediately recommend 911. For mild headache without red flags, recommend OTC pain relief and follow-up if persistent...",
    "category": "emergency",
    "tags": ["triage", "protocol"]
  }'
```

## Response (201)

```json
{
  "scenarios": [
    {
      "scenario_id": "abc-123",
      "name": "Chest Pain - Cardiac Emergency",
      "category": "emergency",
      "scenario_type": "custom",
      "content": {...},
      "rubric_criteria": [...]
    },
    {
      "scenario_id": "def-456",
      "name": "Mild Headache - Non-Emergency",
      "category": "emergency",
      "scenario_type": "custom",
      "content": {...},
      "rubric_criteria": [...]
    }
  ],
  "total": 2
}
```

## Errors

| Status | Description |
|--------|-------------|
| `400` | `text` is required and must be a non-empty string |
| `500` | Scenario generation failed (LLM or DB error) |
