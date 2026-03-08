# Pipecat Text Agent (LiveKit Transport)

A LiveKit-based text target agent for testing the Pipecat provider locally. Uses the same Robin healthcare coordinator persona as the other target agents but registers with the name `preclinical-pipecat-text-agent`.

## Why this exists

The Pipecat provider in the server supports LiveKit transport, but cloud mode requires calling the Pipecat Cloud API. This agent lets you test fully locally by using the `livekit` provider to connect directly to a local LiveKit server where this agent is registered.

## Setup

```bash
npm install
```

## Run (fully local with Ollama)

```bash
export LIVEKIT_URL="ws://localhost:7880"
export LIVEKIT_API_KEY="devkey"
export LIVEKIT_API_SECRET="secret"
export OPENAI_API_KEY="ollama"
export OPENAI_BASE_URL="http://localhost:11434/v1"
export OPENAI_MODEL="llama3.2:3b"
node index.js start
```

## Testing with the platform

Since Pipecat Cloud mode requires a cloud API call, use the `livekit` provider type to test this agent directly:

```bash
curl -s -X POST http://localhost:8000/api/v1/agents \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "livekit",
    "name": "Pipecat LiveKit Local (Ollama)",
    "config": {
      "url": "ws://localhost:7880",
      "api_key": "devkey",
      "api_secret": "secret",
      "agent_name": "preclinical-pipecat-text-agent"
    }
  }'
```

Then start a test run against the created agent.
