# Provider Reference

Preclinical supports these provider types for connecting to healthcare AI agents:

## openai
OpenAI-compatible chat API (most common).
- **Config**: `{"model": "gpt-4", "api_key": "...", "base_url": "..."}`
- Works with any OpenAI-compatible endpoint (OpenAI, Azure, local LLMs via LiteLLM, etc.)

## vapi
Vapi voice AI agents.
- **Config**: `{"phone_number": "+1...", "api_key": "..."}`
- Tests voice-based healthcare agents via phone calls

## livekit
LiveKit-based real-time voice agents.
- **Config**: `{"url": "wss://...", "api_key": "...", "api_secret": "..."}`
- Tests WebRTC voice agents

## pipecat
Pipecat voice AI pipelines.
- **Config**: `{"url": "http://..."}`
- Tests Pipecat-based voice agents

## browser
Web-based chat UIs tested via browser automation (BrowserUse).
- **Config**: `{"url": "https://chatgpt.com"}` or `{"url": "https://claude.ai", "email": "...", "password": "..."}`
- Automates real chat interfaces
- Slow (~5 min/turn) — use low max_turns for iteration
- Some sites need CDP mode for bot detection bypass

## Creating an Agent

```bash
# OpenAI-compatible API
preclinical agents create --provider openai --name "My Agent" \
  --config '{"model": "gpt-4", "base_url": "https://my-api.com/v1"}'

# Voice agent
preclinical agents create --provider vapi --name "My Voice Agent" \
  --config '{"phone_number": "+1234567890", "api_key": "vapi-key"}'

# Browser-based
preclinical agents create --provider browser --name "ChatGPT" \
  --config '{"url": "https://chatgpt.com"}'
```
