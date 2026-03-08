# Pipecat Healthcare Agent

Healthcare coordination voice agent using [Pipecat](https://github.com/pipecat-ai/pipecat) framework with Daily WebRTC transport.

## Features

- **Robin Persona**: Same healthcare coordinator as LiveKit agents
- **OpenAI GPT-4o-mini**: LLM for conversation
- **Cartesia TTS**: Voice synthesis (British Lady - professional, warm)
- **Daily WebRTC**: Real-time audio transport
- **HIPAA-compliant prompts**: Professional healthcare interactions

## Quick Start

### Prerequisites

1. Python 3.11+
2. OpenAI API key
3. Daily API key (get one at https://dashboard.daily.co)

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

## Testing

### E2E Tests (Recommended)

Run end-to-end tests across all deployment modes:

```bash
# Test CLI mode (default)
./tests/run_e2e.sh

# Test specific mode(s)
./tests/run_e2e.sh --modes cli
./tests/run_e2e.sh --modes docker
./tests/run_e2e.sh --modes cloud
./tests/run_e2e.sh --modes cli,docker

# With custom prompt
./tests/run_e2e.sh --modes cli --prompt "I have chest pain"

# Verbose output
./tests/run_e2e.sh --modes cli --verbose
```

The E2E tester:
1. Creates a Daily room
2. Starts the agent in the specified mode
3. Waits for agent to join
4. Runs a pen-test conversation
5. Reports pass/fail

### Smoke Test

```bash
./tests/run_single_smoke_test.sh
# Or with a specific prompt:
./tests/run_single_smoke_test.sh "I need to schedule an appointment"
```

### Manual Testing

1. Run the agent: `./scripts/run_dev.sh`
2. Open the Daily room URL in your browser
3. Allow microphone access
4. Speak to the agent

## Cloud Deployment (Pipecat Cloud)

### Prerequisites

1. Install Pipecat CLI:
   ```bash
   pipx install pipecat-ai-cli
   # or
   uv tool install pipecat-ai-cli
   ```

2. Login to Pipecat Cloud:
   ```bash
   pcc auth login
   ```

### Deploy

1. Build Docker image (ARM64 for Pipecat Cloud):
   ```bash
   docker build --platform=linux/arm64 -t YOUR_DOCKERHUB_USER/preclinical-pipecat-agent:0.1 .
   ```

2. Push to Docker Hub:
   ```bash
   docker push YOUR_DOCKERHUB_USER/preclinical-pipecat-agent:0.1
   ```

3. Update `pcc-deploy.toml` with your Docker Hub username

4. Set secrets:
   ```bash
   pcc secrets set preclinical-pipecat-secrets --file ../../.env
   ```

5. Deploy:
   ```bash
   ./scripts/deploy_cloud.sh
   # or directly:
   pcc deploy
   ```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for LLM |
| `OPENAI_BASE_URL` | No | Custom OpenAI-compatible endpoint (e.g., TrueFoundry) |
| `CARTESIA_API_KEY` | Yes | Cartesia API key for TTS |
| `DAILY_API_KEY` | Yes (local) | Daily API key for room creation |
| `DAILY_ROOM_URL` | No | External room URL to join (for E2E testing) |
| `DAILY_ROOM_TOKEN` | No | Token for external room |
| `PIPECAT_CLOUD_API_KEY` | No | Pipecat Cloud API key (for cloud E2E tests) |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Pipecat Pipeline                      │
├─────────────────────────────────────────────────────────┤
│  Daily Transport (input)                                │
│       ↓                                                 │
│  LLM Context Aggregator (user messages)                 │
│       ↓                                                 │
│  OpenAI GPT-4o-mini (conversation)                      │
│       ↓                                                 │
│  Cartesia TTS - British Lady (speech synthesis)         │
│       ↓                                                 │
│  Daily Transport (output)                               │
│       ↓                                                 │
│  Context Aggregator (assistant messages)                │
└─────────────────────────────────────────────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `bot.py` | Main agent implementation |
| `local_runner.py` | Local development entrypoint |
| `requirements.txt` | Python dependencies |
| `Dockerfile` | Container image for cloud deployment |
| `docker-compose.yml` | Local Docker stack |
| `pcc-deploy.toml` | Pipecat Cloud configuration |
| `scripts/run_dev.sh` | Local dev server script |
| `scripts/deploy_local.sh` | Docker local deployment |
| `scripts/deploy_cloud.sh` | Pipecat Cloud deployment |
| `tests/e2e_tester.py` | E2E test core logic |
| `tests/run_e2e_tests.py` | E2E test orchestrator |
| `tests/run_e2e.sh` | E2E test runner script |
| `tests/smoke_test.py` | Python smoke test |
| `tests/run_single_smoke_test.sh` | Smoke test runner |

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

### Docker build fails

Ensure you're building for the right platform:
```bash
# For local (your architecture)
docker compose up --build

# For Pipecat Cloud (ARM64)
docker build --platform=linux/arm64 -t image:tag .
```
