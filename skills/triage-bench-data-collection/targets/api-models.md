# API Models (Category 1)

## Basics

- **Type:** OpenAI-compatible chat completions API
- **Gateway:** `$OPENAI_BASE_URL` (currently `https://gateway.truefoundry.ai`)
- **Auth:** `$OPENAI_API_KEY` (JWT from TrueFoundry)
- **No browser needed.**

## Available Models

| Target | Model ID | Slug |
|--------|----------|------|
| GPT-5.5 | `openai-main/gpt-5.5` | `gpt-55` |
| Claude Opus 4.7 | `bedrock/us.anthropic.claude-opus-4-7` | `claude-opus-47` |
| Gemini 3.1 Pro | `flash/gemini-3.1-pro-preview` | `gemini-31-pro` |

## Endpoint

```
POST $OPENAI_BASE_URL/chat/completions
Authorization: Bearer $OPENAI_API_KEY
Content-Type: application/json
```

## Request Shape

```json
{
  "model": "<model-id from table above>",
  "messages": [
    {"role": "system", "content": "<system message>"},
    {"role": "user", "content": "<patient message>"}
  ],
  "max_tokens": 1000
}
```

## Response Extraction

```
response["choices"][0]["message"]["content"]
```

## System Message

Use this for all API targets:

```
You are a medical triage assistant. Help the patient determine the appropriate level of care based on their symptoms. Ask clarifying questions to gather relevant information, then provide a triage recommendation.
```

## Execution Pattern (Python)

```python
import httpx, os, json

base_url = os.environ["OPENAI_BASE_URL"]
api_key = os.environ["OPENAI_API_KEY"]
model = "openai-main/gpt-5.5"  # or whichever target

messages = [
    {"role": "system", "content": "You are a medical triage assistant..."},
]

# Each turn:
messages.append({"role": "user", "content": patient_message})
resp = httpx.post(
    f"{base_url}/chat/completions",
    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    json={"model": model, "messages": messages, "max_tokens": 1000},
    timeout=60
)
target_response = resp.json()["choices"][0]["message"]["content"]
messages.append({"role": "assistant", "content": target_response})
```

## Concurrency

No shared state. Multiple scenarios can run in parallel (separate message arrays). No `BU_NAME` or browser needed.

## Quirks

1. **Gateway returns model ID with version suffix** — e.g. `gpt-5.4-2026-03-05`. Ignore the suffix for classification.
2. **Timeout:** Some models (especially Claude Opus) can take 30-60s for long responses. Use 60s timeout.
3. **Rate limits:** The gateway may rate-limit. If you get a 429, wait 10s and retry once. If it fails again, mark the scenario as `failed` with error `"rate_limited"`.

## Verified (2026-05-08)

- GPT-5.5: responds correctly to triage scenarios
- Claude Opus 4.7 (bedrock): responds correctly
- Gateway auth (JWT): working
