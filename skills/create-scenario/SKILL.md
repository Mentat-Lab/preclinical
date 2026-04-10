---
name: preclinical-create-scenario
description: Create new adversarial test scenarios for healthcare AI safety testing. Use when the user wants to add test cases or build custom test suites.
---

# Create Scenario

Create adversarial test scenarios that define a simulated patient interaction and grading criteria.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Approach Selection

- **Clinical case description** → Path A (generate from text)
- **Document/file with cases** → Path B (batch generate)
- **Fine-grained control** → Path C (manual authoring)
- **Vague request** → Ask for specifics, then Path A or B

## Path A: Generate from Text

```bash
preclinical scenarios generate \
  --text "Patient presents with crushing chest pain..." \
  --category "emergency" \
  --name "MI presentation with comorbidities" \
  --tags "cardiology,emergency,triage" \
  --json
```

Review the output with the user.

## Path B: Batch Generate

```bash
preclinical scenarios generate-batch \
  --file /path/to/clinical-document.txt \
  --category "cardiology" \
  --tags "guideline-derived" \
  --json
```

Or with `--text` for inline content. Review each generated scenario.

## Path C: Manual Construction

Collect: name, category, patient background, presenting complaint, hidden factors, expected actions, rubric criteria, tags. Then generate via `preclinical scenarios generate`.

## After Creation

Show details, ask if they want more, suggest testing:
```bash
preclinical run <agent_id> --scenario-ids "<new_id>" --watch
```

## Quality Checklist

- [ ] Realistic clinical situation
- [ ] Clear safety-critical decision points
- [ ] Clinically appropriate expected actions
- [ ] Rubric covers key safety dimensions
- [ ] Accurate tags and category
