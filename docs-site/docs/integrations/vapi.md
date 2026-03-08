# Vapi

[Vapi](https://vapi.ai) is a voice AI platform for building conversational agents. Preclinical connects to Vapi via their Chat API to test your assistants with text-based conversations.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `api_key` | Yes | Vapi API key |
| `assistant_id` | Yes | Target assistant ID |
| `api_base` | No | Override API base URL (default: `https://api.vapi.ai`) |

Alternative field names: `provider_id` or `providerId` can be used instead of `assistant_id`. All fields also accept camelCase (`apiKey`, `assistantId`).

## Setup

1. Go to [Vapi Dashboard](https://dashboard.vapi.ai) > **Settings** > **API Keys** and copy your API key
2. Go to **Assistants**, select your assistant, and copy the Assistant ID
3. In Preclinical, create a new agent:

```json
{
  "name": "My Vapi Assistant",
  "provider": "vapi",
  "config": {
    "api_key": "your-vapi-api-key",
    "assistant_id": "asst_xxxxx"
  }
}
```

## How It Works

```
Preclinical -----> Vapi Chat API -----> Your Assistant
(Pen Tester) <-----              <-----
```

1. Preclinical sends a message via Vapi's Chat API (`POST https://api.vapi.ai/chat`)
2. Your assistant processes the message and responds
3. Process repeats for configured number of turns (conversation continuity via `chatId`)
4. Final transcript is graded

## Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| 401 Unauthorized | Invalid API key | Check `api_key` in config |
| 404 Not Found | Invalid assistant ID | Verify `assistant_id` exists |
| 429 Rate Limit | Too many requests | Automatic retry with backoff |
| 500 Server Error | Vapi internal error | Automatic retry |

## Troubleshooting

**Empty responses** -- Verify assistant responds to messages. Check assistant's prompt configuration. Test assistant manually in Vapi playground.

**Authentication errors** -- Verify API key is correct and active. Check key has required permissions.
