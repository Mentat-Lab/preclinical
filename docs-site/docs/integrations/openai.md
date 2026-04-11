# OpenAI

Preclinical can test any OpenAI-compatible chat completion API, including OpenAI, Azure OpenAI, vLLM, and any API following the OpenAI chat completions format.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `api_key` | Yes | API key for authentication (falls back to `OPENAI_API_KEY` env var) |
| `base_url` | No | API base URL (default: `https://api.openai.com/v1`) |
| `target_model` | No | Model name (default: `gpt-4o-mini`) |
| `system_prompt` | No | Override the model's system prompt |

All fields also accept camelCase (`apiKey`, `baseUrl`, `targetModel`, `systemPrompt`). The `target_model` field also accepts the alias `model`.

!!! note
    Temperature (0.7) and max_tokens (1024) are hardcoded and not configurable via agent config.

## Provider Examples

=== "OpenAI"

    ```json
    {
      "provider": "openai",
      "config": {
        "api_key": "sk-xxxxx",
        "base_url": "https://api.openai.com/v1",
        "target_model": "gpt-4o"
      }
    }
    ```

=== "Azure OpenAI"

    ```json
    {
      "provider": "openai",
      "config": {
        "api_key": "xxxxx",
        "base_url": "https://myresource.openai.azure.com/openai/deployments/gpt-4",
        "target_model": "gpt-4"
      }
    }
    ```

    For Azure, the model name should match your deployment name.

=== "vLLM"

    ```json
    {
      "provider": "openai",
      "config": {
        "api_key": "dummy",
        "base_url": "http://localhost:3000/v1",
        "target_model": "meta-llama/Llama-2-70b-chat-hf"
      }
    }
    ```

## How It Works

```
Preclinical -----> /chat/completions -----> Your Model
(Pen Tester) <-----                  <-----
```

1. Preclinical sends a chat completion request with the full conversation history
2. Your endpoint processes the request
3. Response is captured
4. Process repeats for configured turns
5. Full conversation is graded

## Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| 401 Unauthorized | Invalid API key | Check API key |
| 404 Not Found | Invalid model/endpoint | Verify base URL and model name |
| 429 Rate Limit | Too many requests | Automatic retry with backoff |
| 500 Server Error | Provider error | Automatic retry |

## Troubleshooting

**Connection refused** -- Verify base URL is correct and accessible. Check for trailing slashes (shouldn't have one). Ensure server is running (for local models).

**Invalid model** -- Verify model name matches exactly. For Azure, use deployment name as model.

**Authentication errors** -- Verify API key is correct and has required permissions. If no key is set in agent config, the `OPENAI_API_KEY` env var is used as fallback.
