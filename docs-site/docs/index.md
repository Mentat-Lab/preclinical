# Preclinical

**Adversarial testing platform for healthcare AI agents.**

Preclinical runs adversarial multi-turn conversations against your healthcare AI agents, then grades the transcripts against safety rubrics. It simulates patients using red-team techniques to probe for weaknesses in triage accuracy, medical advice safety, and compliance.

## What it does

1. **Adversarial Pen Testing** -- AI-powered attacks that probe for weaknesses using medical-specific vectors
2. **Rubric-Based Grading** -- Automated evaluation against configurable criteria
3. **Multi-Provider Support** -- Test agents across Vapi, LiveKit, Pipecat, OpenAI, and Browser
4. **Evidence-Based Reports** -- Detailed explanations with transcript quotes for every verdict

## Quick Start

```bash
git clone https://github.com/Mentat-Lab/preclinical.git
cd preclinical
cp .env.example .env
# Add model credentials (OpenAI, Anthropic, or Ollama settings)
docker compose up
```

- **UI + API**: [http://localhost:3000](http://localhost:3000) (single port serves both)

Create an agent, pick scenarios, and start a test run.

## The Problem

Healthcare AI agents are being deployed rapidly, but without standardized testing frameworks. This creates risks:

| Risk | Description |
|------|-------------|
| **Safety** | Agents may provide dangerous medical advice |
| **Compliance** | Agents may violate HIPAA or state regulations |
| **Quality** | Agents may have poor accuracy, tone, or response times |
| **Trust** | Healthcare organizations can't confidently deploy AI agents |

## Use It Your Way

=== "UI"

    Open `http://localhost:3000`, create an agent, and start testing.

=== "CLI"

    ```bash
    pip install preclinical
    preclinical run <agent-id> --creative --watch
    ```

=== "AI Assistant"

    ```bash
    npx skills add Mentat-Lab/preclinical
    ```
    Then just ask: *"Test my healthcare agent with emergency scenarios"*

    Works with Claude Code, Cursor, Windsurf, Copilot, Cline, and more.

=== "Python SDK"

    ```python
    from preclinical import Preclinical

    client = Preclinical()
    run = client.run("agent-id", creative_mode=True)
    print(f"Pass rate: {run.pass_rate}%")
    ```

## Next Steps

- [Quickstart](getting-started/quickstart.md) -- Get up and running in minutes
- [CLI & Agent Skills](getting-started/cli.md) -- Use from terminal or AI coding assistants
- [How It Works](getting-started/how-it-works.md) -- Understand the testing flow
- [Integrations](integrations/overview.md) -- Connect your AI agent
- [API Reference](api-reference/index.md) -- Full REST API documentation
- [CI/CD](getting-started/ci-cd.md) -- Automate testing in your pipeline
