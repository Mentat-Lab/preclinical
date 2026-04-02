# CLI, Plugin & Agent Skills

Preclinical provides a Python CLI/SDK, a Claude Code plugin, and agent skills for AI coding assistants. Use the CLI from your terminal, the plugin from Claude Code, the SDK from Python scripts, or the skills from Cursor, Windsurf, and more.

## Python CLI

### Install

```bash
pip install preclinical
```

### Configure

The CLI needs to know where your Preclinical server is running.

=== "Environment Variable"

    ```bash
    export PRECLINICAL_API_URL=http://localhost:3000
    ```

=== "Config File"

    ```bash
    mkdir -p ~/.preclinical
    cat > ~/.preclinical/config.toml << 'EOF'
    api_url = "http://localhost:3000"
    # api_key = "optional-key"
    EOF
    ```

=== "Per-Command Flag"

    ```bash
    preclinical --url http://localhost:3000 health
    ```

Configuration precedence: CLI flags > environment variables > config file > defaults (`http://localhost:3000`).

### Verify

```bash
preclinical health
preclinical agents list
```

### Run Tests

```bash
# Run all scenarios against an agent
preclinical run <agent-id> --watch

# Creative mode (adversarial LLM-driven attacks)
preclinical run <agent-id> --creative --watch

# Filter by tags
preclinical run <agent-id> --tags cardiology,emergency --watch

# Full configuration
preclinical run <agent-id> \
  --name "Weekly regression" \
  --creative \
  --max-scenarios 20 \
  --concurrency 5 \
  --watch
```

### Manage Agents

```bash
# List agents
preclinical agents list

# Create an agent
preclinical agents create \
  --provider openai \
  --name "My Agent" \
  --config '{"base_url": "https://api.example.com/v1", "model": "gpt-4"}'

# Update an agent
preclinical agents update <agent-id> --name "New Name"

# Delete an agent
preclinical agents delete <agent-id>
```

### Manage Scenarios

```bash
# List scenarios
preclinical scenarios list

# Generate a scenario from clinical text
preclinical scenarios generate \
  --text "Patient presents with crushing chest pain radiating to left arm..." \
  --category emergency \
  --tags cardiology,triage

# Batch generate from a file
preclinical scenarios generate-batch \
  --file clinical-cases.txt \
  --category cardiology
```

### View Results

```bash
# List runs
preclinical runs list

# Get run details
preclinical runs get <run-id>

# List scenario results for a run
preclinical results list <run-id>

# Get detailed scenario result with transcript
preclinical results get <scenario-run-id>

# Watch a running test live
preclinical runs watch <run-id>

# Cancel a run
preclinical runs cancel <run-id>
```

### JSON Output

Every command supports `--json` for machine-readable output:

```bash
preclinical runs list --json
preclinical results list <run-id> --json | jq '.results[] | select(.passed == false)'
```

## Python SDK

Use the SDK for programmatic access in scripts, notebooks, or CI pipelines.

```python
from preclinical import Preclinical

client = Preclinical()  # uses same config as CLI

# One-liner: run tests and wait for results
run = client.run("agent-id", max_turns=5, creative_mode=True)
print(f"Pass rate: {run.pass_rate}%")

# Step by step
started = client.start_run(agent_id="agent-id", tags=["emergency"])
for event in client.watch(started.id):
    print(event)

# Get results
results = client.results(run.id)
for r in results:
    if not r.passed:
        print(f"FAILED: {r.scenario_name} - {r.grade_summary}")
```

### Async SDK

```python
from preclinical import AsyncPreclinical

async with AsyncPreclinical() as client:
    run = await client.run("agent-id", creative_mode=True)
    print(f"Pass rate: {run.pass_rate}%")
```

## Claude Code Plugin

The Preclinical plugin gives Claude Code users a guided, interactive experience with slash commands, automatic health checks, and a cold-start setup wizard.

!!! note "Resource requirements"
    Preclinical runs as Docker containers (database, API server, worker). The plugin's setup command handles bootstrapping, but expect ~2 GB of Docker images on first start.

### Install

**If you cloned the repo**: the plugin loads automatically — no install step needed.

**From the marketplace**:

```
/plugin marketplace add Mentat-Lab/preclinical
/plugin install preclinical@preclinical
```

### Available Commands

| Command | What it does |
|---------|-------------|
| `/preclinical:setup` | Install CLI, start Docker services, configure connection |
| `/preclinical:run` | Run adversarial safety tests with interactive configuration |
| `/preclinical:benchmark` | Full safety benchmark with scorecard across all scenarios |
| `/preclinical:create-scenario` | Author scenarios from clinical text, files, or step-by-step |
| `/preclinical:diagnose` | Analyze why scenarios failed, identify cross-scenario patterns |
| `/preclinical:improve` | Iterative loop: diagnose → create targeted scenarios → retest |
| `/preclinical:compare` | Compare two runs side-by-side, detect regressions |
| `/preclinical:export-report` | Generate markdown safety reports for stakeholders |

### What Happens on Session Start

The plugin runs a non-blocking health check when you start a Claude Code session. It verifies Docker, the CLI, and server connectivity, and warns you if anything is missing:

```
[preclinical] First time? Run /preclinical:setup to get started.
```

or, if partially configured:

```
[preclinical] Setup issues detected:
  - Docker Compose services are not running
  Run /preclinical:setup to fix.
```

### Cold-Start Setup

Running `/preclinical:setup` with nothing installed walks you through two paths:

- **Self-host**: Clones the repo, starts Docker services, installs the CLI
- **Remote server**: Configures the CLI to point at an existing Preclinical server

### Test the Plugin

```bash
bash plugins/preclinical/tests/smoke-test.sh
```

Runs 14 checks across 4 layers: manifest validation, command discovery, health-check behavior, and setup detection.

## Agent Skills (Cursor, Windsurf, Copilot, Cline, and more)

Agent skills provide the same capabilities as the plugin for non-Claude Code AI coding assistants.

### Install

```bash
npx skills add Mentat-Lab/preclinical
```

Works with **Cursor, Windsurf, GitHub Copilot, Cline**, and [20+ other AI agents](https://skills.sh).

### Available Skills

| Skill | What it does |
|-------|-------------|
| `preclinical-setup` | Install CLI, configure server, verify connection |
| `preclinical-run-test` | Full test run workflow with interactive configuration |
| `preclinical-create-scenario` | Author scenarios from clinical text, files, or step-by-step |
| `preclinical-diagnose-failures` | Analyze why scenarios failed, identify patterns |
| `preclinical-improve-agent` | Iterative loop: diagnose → create targeted scenarios → retest |
| `preclinical-compare-runs` | Compare runs side-by-side, detect regressions |
| `preclinical-export-report` | Generate markdown safety reports |
| `preclinical-benchmark` | Full safety benchmark with scorecard |

### Example Conversations

Just talk to your AI assistant naturally:

```
> Test my healthcare agent with emergency scenarios

> Create a scenario where a diabetic patient has atypical chest pain

> Why did my last test run fail?

> Compare my last two runs and check for regressions
```

The skills handle CLI installation, agent selection, configuration, and result interpretation automatically.

### How It Works

```
┌──────────────────────────────────────────────────┐
│  AI Coding Assistant                             │
│  (Claude Code / Cursor / Windsurf / etc.)        │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  Plugin (Claude Code) or Skills (others) │    │
│  │  Clinical domain knowledge + CLI usage   │    │
│  └──────────────┬───────────────────────────┘    │
│                 │ calls                          │
│  ┌──────────────▼───────────────────────────┐    │
│  │  preclinical CLI  (pip install)          │    │
│  └──────────────┬───────────────────────────┘    │
└─────────────────┼────────────────────────────────┘
                  │ HTTP
┌─────────────────▼────────────────────────────────┐
│  Preclinical Server  (docker compose up)         │
└──────────────────────────────────────────────────┘
```

See the [`plugins/preclinical/`](https://github.com/Mentat-Lab/preclinical/tree/main/plugins/preclinical) directory for the plugin and [`skills/`](https://github.com/Mentat-Lab/preclinical/tree/main/skills) for skills.
