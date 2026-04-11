# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Claude Code plugin with 8 slash commands, SessionStart health check, and marketplace support
- Agent skills for non-Claude AI assistants (Cursor, Windsurf, Copilot, Cline)
- Plugin validation in CI pipeline
- ElevenLabs provider

### Changed
- Moved agent skills into main repo (archived `preclinical-skills`)
- Merged 4-skill grader into single grading-guide skill
- Bumped CLI to 0.3.1

### Fixed
- Correct marketplace.json schema (array plugins, add name/owner)
- Auto-generate default triage criterion for benchmark scenarios
- Apply max_scenarios cap when filtering by tags
- Update path-to-regexp to 8.4.1 (CVE fix)

### Removed
- Removed finalize-run route (duplicated worker logic)
- Removed `creativeMode` from GraderState (unused)
- Removed `medical_specialties` from attack vectors (unused)

## [1.0.0] -- 2026-03-10

Initial open-source release of Preclinical as a self-hosted platform.

- Self-hosted via Docker Compose (Postgres + App)
- LangGraph-based tester and grader agents
- Five provider integrations: OpenAI, Vapi, LiveKit, Pipecat, Browser
- Local BrowserUse support
- Full REST API for programmatic test execution
- Python CLI and SDK (PyPI: `preclinical`)
- SSE-based live updates via PG LISTEN/NOTIFY
- Configurable turn limits and model selection
- MkDocs Material documentation site

[Unreleased]: https://github.com/Mentat-Lab/preclinical/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Mentat-Lab/preclinical/releases/tag/v1.0.0
