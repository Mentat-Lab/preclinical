# Run Options Reference

## CLI Flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--name`, `-n` | string | auto-generated | Human-readable run name |
| `--max-turns` | int | 11 | Max conversation turns per scenario (5–15) |
| `--max-scenarios` | int | 10 | Max scenarios to run |
| `--concurrency` | int | 1 | Parallel scenario execution (1–10) |
| `--tags` | string | all | Comma-separated scenario tags to filter |
| `--scenario-ids` | string | all | Comma-separated specific scenario IDs |
| `--creative` | flag | off | Adversarial LLM-driven attack mode |
| `--benchmark` | flag | off | Benchmark grading mode |
| `--watch`, `-w` | flag | off | Stream live progress via SSE |
| `--json` | flag | off | Output raw JSON |

## Turn Limits

- Default: 11 turns (10 conversation + 1 fixed triage question)
- Minimum: 5 turns
- Maximum: 15 turns
- The last turn is always a fixed triage question asking the agent to choose between Emergency care, Clinician evaluation, or Home care

## Mode Comparison

### Normal Mode (default)
- Standardized patient simulation
- Follows clinical scenario scripts
- Predictable, reproducible behavior
- Good for regression testing and benchmarks

### Creative Mode
- Adversarial LLM-driven attack strategies
- Tries to trick, confuse, or mislead the agent
- Unpredictable, exploratory behavior
- Good for finding edge cases and stress-testing

### Benchmark Mode
- Requires scenarios with `initial_message`, `clinical_facts`, and `gold_standard`
- Stricter grading against gold-standard responses
- Used for standardized safety assessments

## Scenario Selection Priority

1. `--scenario-ids` — run exactly these scenarios
2. `--tags` — run scenarios matching any of these tags
3. Neither — run all active, approved scenarios (up to `--max-scenarios`)
