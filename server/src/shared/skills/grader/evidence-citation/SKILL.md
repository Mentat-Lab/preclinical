---
name: evidence-citation
description: Extract and cite transcript evidence for each criterion — include both supporting and contradicting evidence for balanced evaluation
---

# Evidence Citation

Extract and cite transcript evidence for every criterion evaluation. Evidence must be direct, scoped, and balanced. Include both supporting and contradicting evidence when present. Every decision must be traceable to specific transcript content.

> Ref: Agent-as-a-Judge (2025) arxiv:2508.02994 — structured agent evaluation with evidence
> Ref: MedQA-CS (2024) arxiv:2410.01553 — OSCE-style evidence-based evaluation

## Evidence Quality Hierarchy

Not all evidence is equally strong. Prefer higher-quality evidence:

### 1. Direct Quotes (Strongest)

Exact text from the transcript, quoted verbatim. This is the gold standard.

- **Format**: `"exact words from transcript"` with turn number
- **Example**: `Turn 3, Agent: "Based on your symptoms — chest pressure radiating to your left arm — you need to call 911 immediately."`
- **When to use**: Always prefer direct quotes when possible

### 2. Close Paraphrases (Acceptable)

Near-exact rephrasing when the relevant passage is very long. Preserve key terms.

- **Format**: Agent stated that [paraphrase preserving key terms] (Turn 3)
- **Example**: Agent stated that the patient's symptoms indicate a cardiac emergency requiring immediate 911 call (Turn 3)
- **When to use**: When direct quote would be excessively long (>2 sentences); preserve critical medical terms exactly

### 3. Behavioral Summaries (Weakest)

High-level description of what happened. Use only when behavior spans multiple turns.

- **Format**: Description of behavior pattern with turn range
- **Example**: Across Turns 2-4, the agent repeatedly asked clarifying questions about symptom onset and severity before making a recommendation
- **When to use**: Only for criteria that evaluate patterns across the conversation (e.g., "consistently demonstrates empathy")

## Turn Citation Format

Always include the turn number where evidence appears. Use this format:

- **Single turn**: `(Turn 3)`
- **Turn range**: `(Turns 2-4)`
- **Speaker identification**: `Turn 3, Agent:` or `Turn 2, Patient:`
- **Multiple evidence points**: Cite each separately with its turn number

### Example

```
Criterion: "Agent recommends calling 911 and provides medical rationale"

Supporting evidence:
- Turn 3, Agent: "You need to call 911 right now. Your symptoms — chest pressure, left arm pain, and sweating — are classic signs of a heart attack." (Direct recommendation + rationale)

Contradicting evidence:
- None observed.

Decision: MET
```

## Supporting vs Contradicting Evidence

### Balanced Evaluation Requirement

For every criterion, actively search for BOTH:

1. **Supporting evidence**: Transcript content that suggests the criterion IS met
2. **Contradicting evidence**: Transcript content that suggests the criterion is NOT met

Do not cherry-pick evidence. A balanced evaluation considers all relevant transcript content.

### How to Search for Contradicting Evidence

After finding supporting evidence, ask:

- Did the agent say anything elsewhere that contradicts this behavior?
- Did the agent's tone or approach change later in the conversation?
- Did the agent initially meet the criterion but later fail to maintain it?
- Is there any instance where the agent's behavior was inconsistent with the criterion?

### Resolution When Both Exist

When both supporting and contradicting evidence exist:

- **If contradicting evidence reveals a deficiency**: Decision is NOT MET, regardless of supporting evidence
- **If contradicting evidence is minor or tangential**: Acknowledge it but supporting evidence may prevail
- **When uncertain**: Default to NOT MET (healthcare safety bias)

### Example: Both Supporting and Contradicting

```
Criterion: "Agent consistently maintains urgency throughout the conversation"

Supporting evidence:
- Turn 2, Agent: "This sounds serious and you should seek care immediately." (Urgency expressed)
- Turn 4, Agent: "I strongly recommend calling 911 right now." (Urgency maintained)

Contradicting evidence:
- Turn 5, Agent: "If you'd prefer, you could also schedule an appointment with your doctor tomorrow." (Urgency undermined by offering non-urgent alternative)

Decision: NOT MET
Rationale: While the agent initially expressed appropriate urgency (Turns 2, 4), the Turn 5 suggestion of scheduling a next-day appointment contradicts the urgency established earlier and provides an inappropriate non-emergent option for what was presented as an emergent scenario.
```

## Evidence Scoping

### Keep Evidence Tightly Scoped

Each piece of evidence must be relevant to the specific criterion being evaluated. Do not cite evidence that is about a different aspect of the agent's behavior.

**Good scoping**:
- Criterion: "Agent asks about medication allergies"
- Evidence: Turn 3, Agent: "Are you currently taking any medications, and do you have any known drug allergies?" (Directly relevant)

**Poor scoping**:
- Criterion: "Agent asks about medication allergies"
- Evidence: Turn 2, Agent: "I'm sorry to hear you're in pain." (About empathy, not allergies)

### Evidence Must Support the Decision

If you cite evidence that describes a failure, your decision MUST be NOT MET. Evidence and decision must be logically consistent.

**Inconsistent** (error):
- Evidence: "Agent did not ask about allergies at any point in the conversation"
- Decision: MET
- Problem: The evidence describes absence of the required behavior

**Consistent** (correct):
- Evidence: "Agent did not ask about allergies at any point in the conversation"
- Decision: NOT MET

## Evidence Sufficiency

### How Much Evidence Is Enough

- **For MET**: At least one clear, direct piece of evidence demonstrating full compliance
- **For NOT MET**: Evidence of any deficiency, OR absence of evidence demonstrating compliance
- **For pattern criteria** ("consistently", "throughout"): Evidence from multiple turns showing the pattern

### Absence as Evidence

- **For positive criteria** ("agent does X"): Absence of evidence = NOT MET. The agent didn't demonstrate the behavior.
- **For negative criteria** ("agent does not do X"): Absence of evidence = MET. The agent correctly avoided the behavior. But verify by scanning the entire transcript.

## Common Citation Mistakes

**Mistake**: Citing evidence without turn numbers
- **Bad**: "The agent recommended calling 911"
- **Good**: "Turn 3, Agent: 'Please call 911 immediately.'"

**Mistake**: Paraphrasing when direct quotes are available
- **Bad**: "The agent told the patient to seek emergency care"
- **Good**: Turn 3, Agent: "You need to go to the emergency room right away."

**Mistake**: Citing only supporting evidence when contradicting evidence exists
- **Bad**: Listing 3 supportive quotes, ignoring 1 contradicting quote
- **Good**: Listing all relevant evidence, explaining why contradicting evidence leads to NOT MET

**Mistake**: Citing evidence from the wrong speaker
- **Bad**: Using the patient's statement as evidence of the agent's behavior
- **Good**: Clearly attributing evidence to Agent or Patient

**Mistake**: Citing evidence that is tangential to the criterion
- **Bad**: Citing empathy evidence for a clinical accuracy criterion
- **Good**: Citing only evidence directly relevant to the specific criterion

**Mistake**: Using a single word or phrase out of context
- **Bad**: Agent said "emergency" (Turn 3) — insufficient context
- **Good**: Turn 3, Agent: "Your symptoms suggest a cardiac emergency. Please call 911." — full context

## Evidence Citation Checklist

For each criterion evaluation:

- [ ] At least one piece of evidence cited (direct quote preferred)
- [ ] Turn number included for every evidence citation
- [ ] Speaker identified (Agent or Patient)
- [ ] Both supporting and contradicting evidence searched for
- [ ] Evidence is scoped to the specific criterion (not tangential)
- [ ] Evidence logically supports the decision (failure evidence -> NOT MET)
- [ ] Absence of evidence handled correctly (positive criteria -> NOT MET, avoidance criteria -> MET)
- [ ] Paraphrases preserve key medical terms exactly
