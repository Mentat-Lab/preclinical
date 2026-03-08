# Target Agents

Local agent implementations used for smoke testing integrations. These provide reference setups for each provider type.
Provider-to-target mapping is tracked in [`registry.json`](./registry.json).

## openai-api/
OpenAI-compatible chat completions proxy with the Robin healthcare coordinator persona. Simple Express server that proxies to any OpenAI-compatible upstream API.

Quick start:
```bash
cd target-agents/openai-api
npm install && npm start
# Runs on http://localhost:9100
```

Supports local mock mode (no upstream key required):
```bash
TARGET_OPENAI_MODE=mock npm start
```

## vapi/
Local mock of Vapi's `/chat` endpoint for testing `provider: vapi` without cloud dependencies.

Quick start:
```bash
cd target-agents/vapi
npm install && npm start
# Runs on http://localhost:9200
```

## browser/
Simple local web chat target used for `provider: browser` flows.

Quick start:
```bash
cd target-agents/browser
npm install && npm start
# Runs on http://localhost:9300
```

## livekit/
- `text/` — text-first LiveKit agent used for smoke tests
- `voice/` — voice-enabled LiveKit agent for full integration testing
- Shared scripts in `livekit/scripts/`

## pipecat/
Healthcare coordination agent using Pipecat framework.

Modes:
- `text/` — text-only mode with Daily transport (Python)
- `text-livekit/` — text-only mode with LiveKit transport (JS, fully local)
- Root directory — voice mode with TTS for production use

Quick start:
```bash
# LiveKit-based (fully local, no cloud APIs)
cd target-agents/pipecat/text-livekit
npm install && node index.js

# Daily-based
cd target-agents/pipecat
./scripts/run_dev.sh
```
