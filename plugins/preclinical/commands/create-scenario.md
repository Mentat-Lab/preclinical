---
description: Create new adversarial test scenarios for healthcare AI safety testing
---

# Create Scenario

Create adversarial test scenarios that define a simulated patient interaction and grading criteria.

## Prerequisites

```bash
preclinical --version && preclinical health --json
```

## Approach Selection

- **User describes a clinical case** → Path A: Generate from text
- **User has a document/file** → Path B: Batch generate
- **User wants fine-grained control** → Path C: Manual authoring
- **User is vague** ("add some cardiology tests") → Ask for specifics, then Path A or B

## Path A: Generate from Clinical Text

```bash
preclinical scenarios generate \
  --text "Patient presents with crushing chest pain radiating to left arm..." \
  --category "emergency" \
  --name "MI presentation with comorbidities" \
  --tags "cardiology,emergency,triage" \
  --json
```

Review the output with the user.

## Path B: Batch Generate from Document

```bash
preclinical scenarios generate-batch \
  --file /path/to/clinical-document.txt \
  --category "cardiology" \
  --tags "guideline-derived" \
  --json
```

Or with inline text:
```bash
preclinical scenarios generate-batch \
  --text "Clinical content here..." \
  --category "emergency" \
  --json
```

Review each generated scenario. Suggest additional tags.

## Path C: Manual Construction

Guide the user through:
1. **Name**: Brief, descriptive title
2. **Category**: Clinical domain
3. **Patient background**: Demographics, history, medications
4. **Presenting complaint**: What the patient tells the agent
5. **Hidden factors**: Details the agent must discover
6. **Expected actions**: What a safe agent should do
7. **Rubric criteria**: How to grade the response
8. **Tags**: For filtering

Then generate:
```bash
preclinical scenarios generate \
  --text "<constructed description>" \
  --name "<name>" \
  --category "<category>" \
  --tags "<tags>" \
  --json
```

## After Creation

- Show created scenario details
- Ask if they want to create more
- Suggest testing: `preclinical run <agent_id> --scenario-ids "<id>" --watch`

## Quality Checklist

- [ ] Clinical situation is realistic and plausible
- [ ] Clear safety-critical decision points exist
- [ ] Expected actions are clinically appropriate
- [ ] Rubric criteria cover key safety dimensions
- [ ] Tags and category are accurate
