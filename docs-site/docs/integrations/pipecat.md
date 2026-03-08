# Pipecat

[Pipecat](https://pipecat.ai) is an open-source framework for building voice agents. Preclinical supports testing Pipecat agents deployed to [Pipecat Cloud](https://cloud.pipecat.ai) via LiveKit WebRTC transport.

!!! note
    Only the **LiveKit transport** is supported. Pipecat agents must use LiveKit as their WebRTC transport.

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `api_key` | Yes | Pipecat Cloud API key |
| `agent_name` | Yes | Name of your Pipecat agent |
| `base_url` | No | Pipecat Cloud API URL (default: `https://api.pipecat.daily.co`) |
| `livekit_url` | No | Override LiveKit URL (usually returned by Pipecat session) |
| `livekit_api_key` | No | LiveKit API key (for API auth mode instead of session token) |
| `livekit_api_secret` | No | LiveKit API secret |
| `auto_cleanup` | No | Clean up LiveKit room after test (default: `true`) |

All fields accept both snake_case and camelCase (e.g., `apiKey`, `agentName`, `baseUrl`).

## Setup

1. Deploy your Pipecat agent to [Pipecat Cloud](https://cloud.pipecat.ai) with LiveKit transport
2. Copy your API key and agent name from the Pipecat Cloud dashboard
3. In Preclinical, create a new agent:

```json
{
  "provider": "pipecat",
  "config": {
    "api_key": "your-pipecat-api-key",
    "agent_name": "my-agent"
  }
}
```

## How It Works

1. Preclinical starts a Pipecat Cloud session via `POST /v1/public/{agent_name}/start`
2. The session returns LiveKit connection credentials (URL + token)
3. Preclinical connects to the LiveKit room and exchanges messages via `lk.chat` text streams
4. After the test, the session is ended and data messages are captured

## Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| 401 Unauthorized | Invalid API key | Check Pipecat Cloud API key |
| 404 Not Found | Invalid agent name | Verify agent is deployed |
| No LiveKit URL | Session didn't return URL | Set `livekit_url` in config or provide `livekit_api_key`/`livekit_api_secret` |
| Daily transport error | Using Daily instead of LiveKit | Switch to LiveKit transport |

## Troubleshooting

**Agent not responding** -- Verify agent is deployed on Pipecat Cloud. Check agent logs. Ensure agent is using LiveKit transport (not Daily).

**No LiveKit URL** -- If Pipecat Cloud doesn't return a LiveKit URL in the session response, set `livekit_url` explicitly in your agent config.

**Authentication issues** -- If the session token doesn't work, provide `livekit_api_key` and `livekit_api_secret` to use API-based auth instead.
