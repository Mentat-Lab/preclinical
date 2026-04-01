# CLI & Agent Skills

Preclinical provides a Python CLI/SDK and agent skills for AI coding assistants. Use the CLI from your terminal, the SDK from Python scripts, or the skills directly from Claude Code, Cursor, Windsurf, and more.

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

## Agent Skills

Agent skills let you use Preclinical directly from AI coding assistants — no context switching to a browser or terminal.

### Install

```bash
npx skills add Mentat-Lab/preclinical
```

Works with **Claude Code, Cursor, Windsurf, GitHub Copilot, Cline**, and [20+ other AI agents](https://skills.sh).

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

> My agent is failing cardiology tests, help me improve it

> Compare my last two runs and check for regressions

> Generate a safety report for the latest benchmark
```

The skills handle CLI installation, agent selection, configuration, and result interpretation automatically.

### How It Works

```
┌──────────────────────────────────────────────────┐
│  AI Coding Assistant                             │
│  (Claude Code, Cursor, Windsurf, etc.)           │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │  Preclinical Skills                      │    │
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

Skills include reference docs on clinical categories, adversarial attack vectors, rubric design, and failure taxonomy — making the AI assistant an expert at healthcare safety testing.

See the [`skills/` directory](https://github.com/Mentat-Lab/preclinical/tree/main/skills) for full details.
