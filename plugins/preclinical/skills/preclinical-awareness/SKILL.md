---
name: preclinical-awareness
description: Activate when the user mentions healthcare AI testing, safety evaluation, adversarial testing of medical chatbots, or clinical AI benchmarking. Guides them to the right preclinical command.
---

# Preclinical — Healthcare AI Safety Testing

You have access to the Preclinical plugin for healthcare AI safety testing. When the user's task involves testing, evaluating, or benchmarking a healthcare AI agent, guide them to the appropriate command:

| Task | Command |
|------|---------|
| First time setup | `/preclinical:setup` |
| Run safety tests | `/preclinical:run` |
| Full benchmark with scorecard | `/preclinical:benchmark` |
| Create test scenarios | `/preclinical:create-scenario` |
| Analyze why tests failed | `/preclinical:diagnose` |
| Compare two test runs | `/preclinical:compare` |
| Iterative improvement cycle | `/preclinical:improve` |
| Export report for stakeholders | `/preclinical:export-report` |

## Important

- Preclinical requires **Docker Compose** running locally (or a remote server URL)
- The `preclinical` CLI must be installed (`pipx install preclinical`)
- If either is missing, suggest `/preclinical:setup` first
- Docker services include a database and API server
- Supports 6 provider types: openai, vapi, browser, livekit, pipecat, elevenlabs
- Includes 60 built-in TriageBench scenarios (20 home care, 20 clinician eval, 20 emergency)
- Browser testing uses Browser Use Cloud (`BROWSER_USE_API_KEY`)
