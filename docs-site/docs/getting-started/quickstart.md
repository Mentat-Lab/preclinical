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
- An API key: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` (see `.env.example`)
- `BROWSER_USE_API_KEY` if you want to run browser-based tests through Browser Use Cloud

## Setup

```bash
git clone https://github.com/Mentat-Lab/preclinical.git
cd preclinical
make setup          # copies .env.example and starts services
```

Edit `.env` with your API key, then `make restart` to pick up changes.

Daily workflow:

| Command | Description |
|---------|-------------|
| `make up` | Start services |
| `make down` | Stop services |
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
        "url": "https://your-chat-app.example.com",
        "profile_id": "prof_123"
      }
    }
    ```

    Tests web chat UIs through Browser Use Cloud. Reuse the same `profile_id` across repeated runs on the same domain so Browser Use preserves auth and browser state.

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
