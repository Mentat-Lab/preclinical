# Provider Reference

Preclinical supports these provider types for connecting to healthcare AI agents:

## API Providers

### openai
OpenAI-compatible chat API (most common).
- **Config**: `{"model": "gpt-4", "api_key": "...", "base_url": "..."}`
- Works with any OpenAI-compatible endpoint (OpenAI, Azure, local LLMs via LiteLLM, Ollama, etc.)

### vapi
Vapi REST API for voice agents (text-based testing).
- **Config**: `{"phone_number": "+1...", "api_key": "..."}`
- Tests voice-based healthcare agents via text interface

## Voice Providers

### elevenlabs
ElevenLabs Conversational AI via WebSocket (text mode).
- **Config**: `{"agent_id": "...", "api_key": "..."}`
- Tests ElevenLabs voice agents through text

### livekit
LiveKit-based real-time WebRTC voice agents.
- **Config**: `{"url": "wss://...", "api_key": "...", "api_secret": "..."}`
- Tests WebRTC voice agents

### pipecat
Pipecat voice AI pipelines (Daily/LiveKit).
- **Config**: `{"url": "http://..."}`
- Tests Pipecat-based voice agents

## Browser Provider

### browser
Web-based chat UIs tested via browser automation (BrowserUse).
- **Config**: `{"url": "https://chatgpt.com"}` or `{"url": "https://claude.ai", "email": "...", "password": "..."}`
- Automates real chat interfaces (ChatGPT, Claude, Gemini, custom apps)
- Runs ~1-2 min/turn with Chrome pool

**Three backend modes:**
- **Local CDP** (default): Chrome pool on host via `make chrome` (ports 9222-9226)
- **BrowserUse Cloud**: Set `BROWSER_USE_API_KEY` + `BROWSER_USE_API_BASE` in `.env`
- **Browserbase** (cloud Chrome): Set `BROWSERBASE_API_KEY` in `.env` — no local Chrome needed

**Auth support:**
- Sites like claude.ai and gemini.google.com require login — pass `email` and `password` in config
- AgentMail integration: Set `AGENTMAIL_API_KEY` for automated email verification (Cloudflare, Clerk-based auth)
- Mid-conversation auth recovery and credential persistence (cookies/storage per domain)

## Creating an Agent

```bash
# OpenAI-compatible API
preclinical agents create --provider openai --name "My Agent" \
  --config '{"model": "gpt-4", "base_url": "https://my-api.com/v1"}'

# ElevenLabs voice agent
preclinical agents create --provider elevenlabs --name "My Voice Agent" \
  --config '{"agent_id": "abc123", "api_key": "el-key"}'

# Voice agent (Vapi)
preclinical agents create --provider vapi --name "My Vapi Agent" \
  --config '{"phone_number": "+1234567890", "api_key": "vapi-key"}'

# Browser-based (no auth)
preclinical agents create --provider browser --name "ChatGPT" \
  --config '{"url": "https://chatgpt.com"}'

# Browser-based (with auth)
preclinical agents create --provider browser --name "Claude AI" \
  --config '{"url": "https://claude.ai", "email": "you@example.com", "password": "your-pass"}'
```
