# Pipecat Healthcare Agent

Healthcare coordination voice agent using [Pipecat](https://github.com/pipecat-ai/pipecat) framework with Daily WebRTC transport.

## Features

- **Robin Persona**: Healthcare coordinator with professional, warm tone
- **OpenAI GPT-4o-mini**: LLM for conversation
- **Cartesia TTS**: Voice synthesis (British Lady)
- **Daily WebRTC**: Real-time audio transport

## Quick Start

### Prerequisites

1. Python 3.11+
2. OpenAI API key
3. Daily API key (get one at https://dashboard.daily.co)
4. Cartesia API key

### Setup

1. Copy environment template to repo root:
   ```bash
   cp .env.example ../../.env
   # Edit ../../.env with your API keys
   ```

2. Run the local development server:
   ```bash
   ./scripts/run_dev.sh
   ```

3. Join the Daily room URL printed in the console

4. Speak or type to interact with the agent

## Development

### Local Dev Server (Recommended)

```bash
# First time: creates venv and installs dependencies
./scripts/run_dev.sh
```

This will:
1. Create a Python virtual environment
2. Install dependencies
3. Create a temporary Daily room
4. Start the agent
5. Print the room URL to join

### Docker Local

```bash
./scripts/deploy_local.sh
```

View logs:
```bash
docker compose -f docker-compose.yml logs -f
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for LLM |
| `OPENAI_BASE_URL` | No | Custom OpenAI-compatible endpoint |
| `CARTESIA_API_KEY` | Yes | Cartesia API key for TTS |
| `DAILY_API_KEY` | Yes (local) | Daily API key for room creation |
| `DAILY_ROOM_URL` | No | External room URL to join (for E2E testing) |
| `DAILY_ROOM_TOKEN` | No | Token for external room |

## Testing

Run the smoke test to verify basic functionality:

```bash
./tests/run_single_smoke_test.sh
```

For full E2E tests, see `./tests/run_e2e.sh --help`.

## Files

| File | Description |
|------|-------------|
| `bot.py` | Main agent implementation |
| `local_runner.py` | Local development entrypoint |
| `requirements.txt` | Python dependencies |
| `scripts/run_dev.sh` | Local dev server script |
| `scripts/deploy_local.sh` | Docker local deployment |
| `tests/` | E2E and smoke tests |

## Troubleshooting

### "OPENAI_API_KEY is required"

Ensure your `.env` file is at the repo root (not in target-agents/pipecat/) and contains:
```
OPENAI_API_KEY=sk-your-key
```

### "DAILY_API_KEY is required"

Get a Daily API key from https://dashboard.daily.co and add to `.env`:
```
DAILY_API_KEY=your-daily-key
```

### Agent doesn't respond

1. Check browser console for WebRTC errors
2. Ensure microphone permissions are granted
3. Check agent logs for errors
4. Verify OpenAI API key has credits
