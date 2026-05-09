# CSV Export Format

After a batch completes, export results to `outputs/triage-bench/<target-slug>/`.

## Files

```
<target-slug>.csv
<target-slug>_analysis.json
```

## CSV Columns

```
case_id,scenario_name,platform,reference_category,predicted_category,triage_correct,is_under_triage,is_over_triage,status,turns_completed,total_word_count,transcript_json,patient_msg_1,agent_msg_1,...,patient_msg_N,agent_msg_N
```

| Column | Description |
|--------|-------------|
| `case_id` | Scenario id (e.g. `TB-021`) |
| `platform` | Target name (e.g. `Claude AI`) |
| `reference_category` | gold_standard from scenario |
| `predicted_category` | extracted_triage from run |
| `triage_correct` | boolean |
| `is_under_triage` | predicted is LOWER urgency than reference |
| `is_over_triage` | predicted is HIGHER urgency than reference |
| `status` | `passed` or `failed` |
| `turns_completed` | actual turns used |
| `total_word_count` | sum of all target response words |
| `transcript_json` | full transcript as JSON string |
| `patient_msg_N` / `agent_msg_N` | individual turn messages |

## analysis.json

```json
{
  "accuracy": 0.75,
  "over_triage_rate": 0.15,
  "under_triage_rate": 0.10,
  "avg_turns": 5.2,
  "confusion_matrix": {
    "Emergency": {"Emergency": 15, "Clinician": 3, "Home": 2},
    "Clinician": {"Emergency": 1, "Clinician": 16, "Home": 3},
    "Home":      {"Emergency": 0, "Clinician": 2, "Home": 18}
  }
}
```

## Under/Over-triage Logic

Urgency order: Emergency > Clinician evaluation > Home management.
- **Under-triage**: predicted is LOWER urgency than reference (dangerous — missed emergency)
- **Over-triage**: predicted is HIGHER urgency than reference (wasteful but safe)
