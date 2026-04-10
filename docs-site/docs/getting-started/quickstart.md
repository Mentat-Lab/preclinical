# Quickstart

Run your first test against a healthcare AI agent. You'll:

1. Set up the platform
2. Add an agent
3. Start a test run
4. Review results

!!! tip "Prefer the terminal or an AI assistant?"
    You can also use the [CLI or agent skills](cli.md) instead of the UI. Install via `pip install preclinical` or `npx skills add Mentat-Lab/preclinical`.

## Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- Google Chrome (for browser-based testing)
- An API key: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or Ollama (see `.env.example`)

## Setup

```bash
git clone https://github.com/Mentat-Lab/preclinical.git
cd preclinical
make setup          # copies .env.example, launches Chrome pool, starts services
```

Edit `.env` with your API key, then `make restart` to pick up changes.

`make up` launches a pool of 5 Chrome instances (ports 9222-9226) for parallel browser testing. Each scenario gets its own Chrome instance. You can customize with `make up CHROME_INSTANCES=3 CHROME_BASE_PORT=9300`.

Daily workflow:

| Command | Description |
|---------|-------------|
| `make up` | Launch Chrome pool + start services |
| `make down` | Stop services + Chrome |
| `make logs` | Tail logs |
| `make status` | Check health |
| `make clean` | Nuke volumes, start fresh |

Open `http://localhost:3000` to access the UI.

## Step 1: Add an Agent

Agents are provider configurations Preclinical can execute against. In the UI, go to **Agents** and click **New Agent**.

=== "Vapi"

    ```json
    {
      "provider": "vapi",
      "name": "My Vapi Agent",
      "config": {
        "assistant_id": "asst_xxxxx",
        "api_key": "your-vapi-api-key"
      }
    }
    ```

    Get your API key from the [Vapi Dashboard](https://dashboard.vapi.ai).

=== "OpenAI-Compatible"

    ```json
    {
      "provider": "openai",
      "name": "My OpenAI-Compatible Agent",
      "config": {
        "base_url": "https://api.openai.com/v1",
        "api_key": "your-api-key",
        "target_model": "gpt-4o-mini"
      }
    }
    ```

    Works with any OpenAI-compatible endpoint.

=== "Browser"

    ```json
    {
      "provider": "browser",
      "name": "My Browser Agent",
      "config": {
        "url": "https://your-chat-app.example.com"
      }
    }
    ```

    Tests web chat UIs via CDP. `make up` handles Chrome automatically.

=== "LiveKit"

    ```json
    {
      "provider": "livekit",
      "name": "My LiveKit Agent",
      "config": {
        "url": "wss://your-project.livekit.cloud",
        "api_key": "APIxxxxx",
        "api_secret": "xxxxx",
        "dispatch_mode": "auto",
        "agent_name": "healthcare-agent"
      }
    }
    ```

    Get credentials from the [LiveKit Cloud Dashboard](https://cloud.livekit.io).

=== "Pipecat"

    ```json
    {
      "provider": "pipecat",
      "name": "My Pipecat Agent",
      "config": {
        "api_key": "your-pipecat-cloud-key",
        "agent_name": "my-agent",
        "transport": "livekit"
      }
    }
    ```

    Optional BYOK LiveKit config (`livekit_url`, `livekit_api_key`, `livekit_api_secret`) is supported.

## Step 2: Start a Test Run

1. Open an agent detail page from **Agents**.
2. Click **New Test Run**.
3. Select scenarios from the 60 TriageBench cases (or use defaults).
4. Set max turns.
5. Click **Start Test Run**.

!!! note
    Max turns are clamped server-side to configured bounds (default range: 5-7).

## Step 3: Monitor Execution

Scenarios execute automatically based on your agent's provider. You'll see live status updates for:

- Scenario progress and state transitions
- Transcript updates as conversations complete
- Grading results as they finalize

## Step 4: Review Results

When the run finalizes, review:

- **Summary Dashboard**: pass/fail counts and breakdowns
- **Scenario Results**: per-scenario status and grading output
- **Transcripts**: full attacker vs target conversation logs
- **Criterion Decisions**: MET/PARTIALLY MET/NOT MET with rationale and evidence
