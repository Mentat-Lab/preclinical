# Preclinical

Python SDK and CLI for [Preclinical](https://preclinical.co) — adversarial testing for healthcare AI agents.

## Installation

```bash
pip install preclinical
```

## SDK

```python
from preclinical import Preclinical

with Preclinical() as client:
    # Start a test run
    started = client.start_run(agent_id="...", max_turns=5, tags=["cardiac"])

    # Watch live events
    for event in client.watch(started.id):
        print(event.event, event.data)

    # Or poll manually
    run = client.get_run(started.id)
    print(f"Status: {run.status}")

    # Get detailed results
    results = client.list_scenario_runs(started.id)
    for r in results.items:
        print(f"{r.status} — {r.scenario_name}")
```

### Async

```python
from preclinical import AsyncPreclinical

async with AsyncPreclinical() as client:
    started = await client.start_run(agent_id="...", max_turns=5)
    async for event in client.watch(started.id):
        print(event.event, event.data)
```

### More examples

```python
with Preclinical() as client:
    # Agents
    agents = client.list_agents()
    agent = client.create_agent(provider="openai", name="My Agent", config={...})

    # Scenarios
    scenarios = client.list_scenarios(tag="cardiac")
    scenario = client.generate_scenario(text="Patient presents with chest pain...")
```

## CLI

```bash
# Run tests
preclinical run <agent_id> --max-turns 5 --tags cardiac

# Watch live
preclinical runs watch <run_id>

# Results
preclinical results list <run_id>

# Agents
preclinical agents list
preclinical agents create --provider openai --name "My Agent"

# Scenarios
preclinical scenarios list
preclinical scenarios generate --text "Patient presents with..."

# Health
preclinical health
```

All commands support `--json` for machine-readable output.

## Configuration

Resolved in order: CLI flags > env vars > config file > defaults.

```bash
export PRECLINICAL_API_URL=http://localhost:3000
export PRECLINICAL_API_KEY=your-key
```

```toml
# ~/.preclinical/config.toml
api_url = "https://your-server.example.com"
api_key = "your-api-key"
```

## Claude Code Plugin

If you use Claude Code, install the plugin for a guided experience with slash commands:

```
/plugin marketplace add Mentat-Lab/preclinical
/plugin install preclinical@preclinical
/preclinical:setup
```

Commands: `/preclinical:run`, `/preclinical:benchmark`, `/preclinical:diagnose`, `/preclinical:compare`, `/preclinical:improve`, `/preclinical:create-scenario`, `/preclinical:export-report`.

## Docs

[docs.preclinical.co](https://docs.preclinical.co)
