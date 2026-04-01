---
name: preclinical-create-scenario
description: Create new adversarial test scenarios for healthcare AI safety testing. Use when the user wants to add test cases, write scenarios from clinical descriptions, import cases from documents, or build custom test suites. Understands clinical domains, attack vectors, and grading rubrics.
---

# Create Scenario

Create adversarial test scenarios for healthcare AI agents. Scenarios define a simulated patient interaction and the grading criteria for evaluating the agent's response.

## Prerequisites

Ensure `preclinical` CLI is installed:
```bash
preclinical --version && preclinical health --json
```

## Approach Selection

Determine which path based on the user's input:

- **User describes a clinical case** → Path A: Generate from text
- **User has a document/file with clinical cases** → Path B: Batch generate from file
- **User wants fine-grained control** → Path C: Manual authoring
- **User is vague ("add some cardiology tests")** → Ask what specific clinical situations they want to test, then use Path A or B

## Path A: Generate from Clinical Text

Best for: Single scenario from a description.

1. Take the user's clinical description
2. Optionally ask for category and tags (see `reference/clinical-categories.md`)
3. Generate via CLI:

```bash
preclinical scenarios generate \
  --text "Patient presents with crushing chest pain radiating to left arm, history of diabetes and hypertension..." \
  --category "emergency" \
  --name "MI presentation with comorbidities" \
  --tags "cardiology,emergency,triage" \
  --json
```

4. Review the generated scenario output with the user
5. Verify it covers the key clinical decision points (see `reference/scenario-anatomy.md`)

## Path B: Batch Generate from Document

Best for: Multiple scenarios from a clinical guideline, case study collection, or protocol document.

1. Read the user's file to understand the clinical content
2. Generate multiple scenarios:

```bash
preclinical scenarios generate-batch \
  --file /path/to/clinical-document.txt \
  --category "cardiology" \
  --tags "guideline-derived" \
  --json
```

Or if the content is provided inline:

```bash
preclinical scenarios generate-batch \
  --text "Clinical content here..." \
  --category "emergency" \
  --json
```

3. Review each generated scenario with the user
4. Suggest additional tags and categories based on content

## Path C: Manual Scenario Construction

Best for: When the user needs precise control over scenario content and grading criteria.

Guide the user through building a scenario step by step. Refer to `reference/scenario-anatomy.md` for the full structure.

Key fields to collect:
1. **Name**: Brief, descriptive title
2. **Category**: Clinical domain (see `reference/clinical-categories.md`)
3. **Patient background**: Demographics, medical history, medications
4. **Presenting complaint**: What the patient tells the agent
5. **Hidden factors**: Clinical details the agent must discover through questioning
6. **Expected actions**: What a safe agent should do
7. **Rubric criteria**: How to grade the agent's response (see `reference/rubric-criteria.md`)
8. **Tags**: For filtering and organization

Once collected, create via the API:
```bash
preclinical scenarios generate \
  --text "<constructed clinical description>" \
  --name "<scenario name>" \
  --category "<category>" \
  --tags "<tags>" \
  --json
```

## After Creation

- Show the user the created scenario details
- Ask if they want to create more scenarios
- Suggest running tests with the new scenarios:
  ```bash
  preclinical run <agent_id> --scenario-ids "<new_scenario_id>" --watch
  ```

## Quality Checklist

Before finalizing any scenario, verify:
- [ ] Clinical situation is realistic and plausible
- [ ] There are clear safety-critical decision points
- [ ] The expected actions are clinically appropriate
- [ ] Rubric criteria cover the key safety dimensions
- [ ] Tags and category are accurate for filtering
