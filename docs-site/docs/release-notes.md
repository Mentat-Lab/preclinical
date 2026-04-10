# Release Notes

## v1.0.0 -- OSS Self-Hosted Release

**March 2026**

Initial open-source release of Preclinical as a self-hosted platform.

- Self-hosted via Docker Compose (3 services: Postgres + App + BrowserUse)
- LangGraph-based tester and grader agents
- Five provider integrations: OpenAI, Vapi, LiveKit, Pipecat, Browser
- Local LLM support via Ollama (`docker compose --profile ollama up`)
- Local BrowserUse support (`docker compose --profile browseruse up`)
- Full REST API for programmatic test execution
- SSE-based live updates via PG LISTEN/NOTIFY
- Configurable turn limits and model selection

Repository: [https://github.com/Mentat-Lab/preclinical](https://github.com/Mentat-Lab/preclinical)
