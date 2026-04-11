# Release Notes

## v1.0.0 -- OSS Self-Hosted Release

**March 2026**

Initial open-source release of Preclinical as a self-hosted platform.

- Self-hosted via Docker Compose (Postgres + App)
- LangGraph-based tester and grader agents
- Five provider integrations: OpenAI, Vapi, LiveKit, Pipecat, Browser Use Cloud
- Browser testing runs through Browser Use Cloud with persisted profiles for repeat runs
- Full REST API for programmatic test execution
- SSE-based live updates via PG LISTEN/NOTIFY
- Configurable turn limits and model selection

Repository: [https://github.com/Mentat-Lab/preclinical](https://github.com/Mentat-Lab/preclinical)
