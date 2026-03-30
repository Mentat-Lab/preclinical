# Preclinical

Python SDK and CLI for [Preclinical](https://preclinical.co) — adversarial testing for healthcare AI agents.

## Installation

```bash
pip install preclinical
```

## SDK

```python
from preclinical import Preclinical

client = Preclinical()

# Run tests and wait for results — one line
run = client.run("agent-id", max_turns=5, tags=["cardiac"])
print(f"Pass rate: {run.pass_rate}%")

# Get detailed results
for r in client.results(run.id):
    print(f"{'PASS' if r.passed else 'FAIL'} {r.scenario_name}")
```

### Async

```python
from preclinical import AsyncPreclinical

async with AsyncPreclinical() as client:
    run = await client.run("agent-id", max_turns=5)
    results = await client.results(run.id)
```

### Step by step

```python
with Preclinical() as client:
    # Start without waiting
    started = client.start_run(agent_id="...", max_turns=5)

    # Watch live events
    for event in client.watch(started.id):
        print(event.event, event.data)

    # Or poll manually
    run = client.get_run(started.id)

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

## Docs

[docs.preclinical.co](https://docs.preclinical.co)
