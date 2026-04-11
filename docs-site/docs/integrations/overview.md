# Integrations

Preclinical supports testing AI agents across multiple voice and chat platforms.

## Supported Providers

| Provider | Transport | Status |
|----------|-----------|--------|
| [Vapi](vapi.md) | HTTP API | Supported |
| [LiveKit](livekit.md) | WebRTC | Supported |
| [Pipecat](pipecat.md) | WebRTC | Supported |
| [OpenAI](openai.md) | HTTP API | Supported |
| [Browser](browser.md) | Browser Use Cloud | Supported |

## Adding an Integration

1. Click **Agents** in the sidebar
2. Click **New Agent**
3. Choose your provider from the dropdown
4. Enter the required configuration (API keys, endpoints, etc.)
5. Click **Test** to verify the integration works
6. Save the integration

## Security

!!! warning
    API keys are stored securely and never exposed to the frontend. They are only used server-side during test execution.

Best practices:

- Use environment-specific API keys (test vs production)
- Rotate keys periodically
- Use scoped keys with minimum required permissions
