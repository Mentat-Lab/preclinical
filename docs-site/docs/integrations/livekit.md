# LiveKit

[LiveKit](https://livekit.io) is a real-time voice and video infrastructure platform. Preclinical connects via WebRTC to test your LiveKit agents using text streams (`lk.chat`).

## Configuration

| Field | Required | Description |
|-------|----------|-------------|
| `url` | Yes | LiveKit server URL (`wss://...` or `https://...`) |
| `api_key` | Conditional | LiveKit API key (required for `api` auth mode) |
| `api_secret` | Conditional | LiveKit API secret (required for `api` auth mode) |
| `agent_name` | Conditional | Agent dispatch name (required for `explicit` dispatch mode) |
| `dispatch_mode` | No | `auto` (default) or `explicit` — how the agent joins the room |
| `auth_mode` | No | `api` (default) or `token` — how room tokens are generated |
| `room_prefix` | No | Room name prefix (default: `preclinical-test`) |
| `room_name` | No | Specific room name (auto-generated if not set) |
| `auto_cleanup` | No | Delete room after test (default: `true`) |

All fields accept both snake_case and camelCase (e.g., `apiKey`, `agentName`, `dispatchMode`).

### Token Auth Mode

When `auth_mode` is `token`, these additional fields are used:

| Field | Description |
|-------|-------------|
| `token` | Pre-generated JWT token (also accepts `jwt` or `livekit_token`) |
| `token_url` | URL of a token endpoint (POST) |
| `token_headers` | JSON string of extra headers for the token endpoint |
| `token_body` | JSON string of extra body fields for the token endpoint |
| `token_field` | Response field containing the token (default: `token`) |

## Setup

1. Go to [LiveKit Cloud](https://cloud.livekit.io) > project **Settings** and copy Server URL, API Key, and API Secret
2. Ensure your LiveKit agent is deployed and registered with a dispatch name
3. In Preclinical, create a new agent:

```json
{
  "provider": "livekit",
  "config": {
    "url": "wss://your-project.livekit.cloud",
    "api_key": "APIxxxxxxxx",
    "api_secret": "your-secret",
    "agent_name": "my-agent",
    "dispatch_mode": "explicit"
  }
}
```

## How It Works

1. Preclinical creates a LiveKit room for the test
2. If `dispatch_mode` is `explicit`, the agent is dispatched to the room via API
3. The pen tester joins the room and exchanges messages via `lk.chat` text streams
4. Transcript is captured and the room is cleaned up (if `auto_cleanup` is enabled)

## Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| Connection timeout | Network issues | Verify LiveKit URL is correct |
| Agent not dispatched | Agent offline | Check agent is deployed and registered |
| Auth failed | Invalid credentials | Verify API key and secret |
| Timed out waiting for agent | Agent didn't join within 15s | Check agent deployment and dispatch name |

## Troubleshooting

**Agent not joining** -- Verify agent is deployed and running. Check agent is registered with the correct dispatch name. Ensure `dispatch_mode` matches your setup (`explicit` if using agent dispatch, `auto` if agent auto-joins rooms).

**Connection failures** -- Verify LiveKit URL format (accepts `wss://` or `https://`). Check API key/secret are correct. Ensure LiveKit project is active.

**Token auth issues** -- If using `auth_mode: "token"`, ensure either a static `token` is provided or `token_url` points to a working token endpoint.
