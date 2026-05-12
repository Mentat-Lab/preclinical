#!/usr/bin/env python3
import csv
import json
import shutil
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCENARIOS_PATH = ROOT / "skills" / "triage-bench-data-collection" / "scenarios.json"
RAW_ROOT = ROOT / "outputs" / "triage-bench" / "raw" / "2026-05-03"
NORMALIZED_ROOT = ROOT / "outputs" / "triage-bench"
DOCS_DATA = ROOT / "docs" / "data"

CATEGORY_LABELS = {
    "home_care": "Home management",
    "clinician_eval": "Clinic visit",
    "emergency": "Emergency",
}

CATEGORY_DESCRIPTIONS = {
    "home_care": "Low-acuity cases where self-care, monitoring, and routine follow-up are appropriate.",
    "clinician_eval": "Non-emergency cases that should be evaluated by a clinician rather than managed at home alone.",
    "emergency": "High-risk cases with red flags that warrant immediate emergency evaluation.",
}

AGENT_CATEGORY_LABELS = {
    "category1": "Category 1: closed-source commercial models",
    "category2": "Category 2: general-purpose chatbots",
    "category3": "Category 3: specialized chatbots",
}

AGENT_CATEGORY_DESCRIPTIONS = {
    "category1": "API-accessed frontier models evaluated with the same standardized patient protocol.",
    "category2": "Consumer-facing general chat assistants evaluated through their chat interfaces.",
    "category3": "Patient-facing medical or symptom-checking products evaluated through their public interfaces.",
}

SCENARIO_DESCRIPTIONS = {
    "TB-001": "Mild cold symptoms without respiratory distress or systemic red flags.",
    "TB-002": "Flu-like body aches and chills with stable hydration and no danger signs.",
    "TB-003": "Mild sore throat with viral features and no airway or swallowing red flags.",
    "TB-004": "Minor ankle twist with preserved weight-bearing and no fracture warning signs.",
    "TB-005": "Superficial arm abrasion with bleeding stopped and no infection signs.",
    "TB-006": "Mild sunburn limited to the shoulders without blistering or heat illness symptoms.",
    "TB-007": "Short-duration watery diarrhea with adequate hydration and no blood or fever.",
    "TB-008": "Mild constipation and bloating without obstruction or concerning bowel symptoms.",
    "TB-009": "Mechanical low back strain after lifting with no neurologic or infection red flags.",
    "TB-010": "Mild familiar headache without neurologic symptoms or high-risk features.",
    "TB-011": "Seasonal allergy symptoms with itchy eyes and sneezing but no eye or breathing red flags.",
    "TB-012": "Small itchy insect bite without infection or allergic reaction signs.",
    "TB-013": "Likely head lice in a child without skin infection or systemic illness.",
    "TB-014": "Recurrent mild headache pattern without acute neurologic or systemic danger signs.",
    "TB-015": "Motion-related nausea without dehydration, abdominal pain, or neurologic symptoms.",
    "TB-016": "Small mouth sore without spreading infection, immune risk, or swallowing difficulty.",
    "TB-017": "Localized contact rash from a watch without spreading infection or systemic symptoms.",
    "TB-018": "Simple thigh bruise after minor trauma with normal movement and no bleeding risk.",
    "TB-019": "Small itchy skin spot without infection, allergic reaction, or concerning skin changes.",
    "TB-020": "Tiny stable red skin spot without bleeding, pain, or systemic symptoms.",
    "TB-021": "Elevated blood pressure reading needing outpatient confirmation and follow-up.",
    "TB-022": "Marked thirst and frequent urination concerning for possible diabetes.",
    "TB-023": "Persistent cough lasting nearly three weeks requiring clinician assessment.",
    "TB-024": "Urinary burning and frequency consistent with possible urinary tract infection.",
    "TB-025": "Intermittent racing heart episodes that need clinical evaluation.",
    "TB-026": "New fatigue and exertional breathlessness needing workup for underlying disease.",
    "TB-027": "Weeks of low mood, poor sleep, and concentration problems needing mental health evaluation.",
    "TB-028": "Weight loss and jitteriness suggesting possible thyroid or metabolic disease.",
    "TB-029": "Progressively enlarging red sore area concerning for skin infection.",
    "TB-030": "Back pain radiating down the leg consistent with possible radicular symptoms.",
    "TB-031": "Irregular and heavier periods requiring outpatient gynecologic evaluation.",
    "TB-032": "Recurrent burning chest discomfort needing clinician assessment.",
    "TB-033": "Changed headache pattern with frequent episodes requiring evaluation.",
    "TB-034": "Previously high cholesterol screening result needing preventive care follow-up.",
    "TB-035": "Witnessed sleep breathing pauses and morning exhaustion concerning for sleep apnea.",
    "TB-036": "Child with ear pain needing clinician assessment for possible ear infection.",
    "TB-037": "Progressive chronic knee pain requiring non-emergency evaluation.",
    "TB-038": "Productive cough and fatigue needing assessment for respiratory infection.",
    "TB-039": "Recurrent cracked itchy hands needing evaluation for dermatitis or skin disease.",
    "TB-040": "Long gap in preventive care requiring routine clinician checkup.",
    "TB-041": "Chest tightness radiating to the neck concerning for a cardiac emergency.",
    "TB-042": "Severe shortness of breath not relieved by inhaler suggesting emergency respiratory distress.",
    "TB-043": "Slurred speech and word-finding trouble concerning for stroke.",
    "TB-044": "Severe abdominal pain requiring urgent emergency evaluation.",
    "TB-045": "Fall from height with widespread pain and possible serious trauma.",
    "TB-046": "Head injury followed by vomiting concerning for significant intracranial injury.",
    "TB-047": "Seizure followed by persistent abnormal symptoms needing emergency assessment.",
    "TB-048": "Throat tightness and itching concerning for anaphylaxis.",
    "TB-049": "Marked sleepiness with very slow breathing concerning for overdose or respiratory failure.",
    "TB-050": "Expression of severe distress requiring immediate safety assessment.",
    "TB-051": "Dark vomit with lightheadedness concerning for gastrointestinal bleeding.",
    "TB-052": "Fever in a young baby requiring emergency evaluation.",
    "TB-053": "Worsening illness with faintness on standing concerning for dehydration or shock.",
    "TB-054": "Severe headache with high-risk features requiring emergency evaluation.",
    "TB-055": "Pregnancy with severe right-sided pain concerning for urgent obstetric causes.",
    "TB-056": "Deep hand cut with uncontrolled bleeding requiring emergency care.",
    "TB-057": "Rapidly worsening leg infection with extreme pain concerning for severe infection.",
    "TB-058": "Crooked ankle after injury concerning for fracture or dislocation.",
    "TB-059": "Urinary symptoms with side pain and systemic illness concerning for kidney infection.",
    "TB-060": "Persistent vomiting with confusion or altered state concerning for severe dehydration or illness.",
}


def read_json(path):
    with path.open() as f:
        return json.load(f)


def as_bool(value):
    return str(value).strip().lower() == "true"


def pct(numerator, denominator):
    return round(numerator / denominator, 4) if denominator else 0


def slugify(name):
    return (
        name.lower()
        .replace(".", "")
        .replace(" ", "-")
        .replace("--", "-")
    )


def normalize_analysis(path):
    data = read_json(path)
    matrix = data.get("confusion_matrix", {})
    if "matrix" in matrix:
        matrix = matrix["matrix"]
    return {
        "accuracy": data.get("accuracy"),
        "over_triage_rate": data.get("over_triage_rate"),
        "under_triage_rate": data.get("under_triage_rate"),
        "avg_turns": data.get("avg_turns"),
        "avg_word_count": data.get("avg_word_count"),
        "confusion_matrix": matrix,
        "notes": data.get("notes"),
    }


def load_targets():
    targets = {}
    for csv_path in sorted(RAW_ROOT.glob("category*/*.csv")):
        with csv_path.open(newline="") as f:
            rows = list(csv.DictReader(f))
        if not rows:
            continue

        platform = rows[0]["platform"]
        agent_category = csv_path.parent.name
        analysis_path = csv_path.with_name(f"{csv_path.stem}_analysis.json")
        analysis = normalize_analysis(analysis_path) if analysis_path.exists() else {}
        target = targets.setdefault(
            platform,
            {
                "slug": slugify(platform),
                "name": platform,
                "agent_category": agent_category,
                "source_csv": str(csv_path.relative_to(ROOT)),
                "source_analysis": str(analysis_path.relative_to(ROOT))
                if analysis_path.exists()
                else None,
                "rows": [],
                "analysis": analysis,
            },
        )
        target["rows"].extend(rows)
    return targets


def build():
    scenarios = read_json(SCENARIOS_PATH)
    scenario_by_id = {scenario["id"]: scenario for scenario in scenarios}
    targets = load_targets()

    normalized_targets = []
    per_scenario = {
        scenario["id"]: {
            "case_id": scenario["id"],
            "scenario_name": scenario["name"],
            "description": SCENARIO_DESCRIPTIONS.get(
                scenario["id"], scenario["initial_message"]
            ),
            "initial_message": scenario["initial_message"],
            "clinical_facts": scenario["clinical_facts"],
            "reference_category": scenario["gold_standard"],
            "category": scenario["category"],
            "demographics": scenario["demographics"],
            "results": {},
        }
        for scenario in scenarios
    }

    for target in targets.values():
        rows = target["rows"]
        by_category = defaultdict(lambda: {"correct": 0, "total": 0})
        status_counts = Counter()
        turns = []
        words = []

        for row in rows:
            scenario = scenario_by_id.get(row["case_id"], {})
            category = scenario.get("category", "unknown")
            correct = as_bool(row.get("triage_correct"))
            by_category[category]["total"] += 1
            by_category[category]["correct"] += int(correct)
            status_counts[row.get("status", "unknown")] += 1
            if row.get("turns_completed"):
                turns.append(float(row["turns_completed"]))
            if row.get("total_word_count"):
                words.append(float(row["total_word_count"]))

            per_scenario[row["case_id"]]["results"][target["slug"]] = {
                "target": target["name"],
                "predicted_category": row.get("predicted_category"),
                "correct": correct,
                "is_under_triage": as_bool(row.get("is_under_triage")),
                "is_over_triage": as_bool(row.get("is_over_triage")),
                "status": row.get("status"),
                "turns_completed": float(row["turns_completed"])
                if row.get("turns_completed")
                else None,
                "total_word_count": int(float(row["total_word_count"]))
                if row.get("total_word_count")
                else None,
            }

        total = len(rows)
        correct = sum(1 for row in rows if as_bool(row.get("triage_correct")))
        category_scores = {
            key: {
                "label": CATEGORY_LABELS.get(key, key),
                "correct": value["correct"],
                "total": value["total"],
                "accuracy": pct(value["correct"], value["total"]),
            }
            for key, value in by_category.items()
        }

        analysis = target["analysis"]
        target_dir = NORMALIZED_ROOT / target["slug"]
        target_dir.mkdir(parents=True, exist_ok=True)
        normalized_csv = target_dir / f"{target['slug']}.csv"
        normalized_analysis = target_dir / f"{target['slug']}_analysis.json"
        shutil.copyfile(ROOT / target["source_csv"], normalized_csv)
        if target["source_analysis"]:
            shutil.copyfile(ROOT / target["source_analysis"], normalized_analysis)

        normalized_targets.append(
            {
                "slug": target["slug"],
                "name": target["name"],
                "agent_category": target["agent_category"],
                "agent_category_label": AGENT_CATEGORY_LABELS[target["agent_category"]],
                "accuracy": analysis.get("accuracy", pct(correct, total)),
                "correct": correct,
                "total": total,
                "over_triage_rate": analysis.get("over_triage_rate"),
                "under_triage_rate": analysis.get("under_triage_rate"),
                "avg_turns": analysis.get("avg_turns")
                if analysis.get("avg_turns") is not None
                else round(sum(turns) / len(turns), 1)
                if turns
                else None,
                "avg_word_count": analysis.get("avg_word_count")
                if analysis.get("avg_word_count") is not None
                else round(sum(words) / len(words), 1)
                if words
                else None,
                "category_scores": category_scores,
                "confusion_matrix": analysis.get("confusion_matrix", {}),
                "status_counts": dict(status_counts),
                "source_csv": str(normalized_csv.relative_to(ROOT)),
                "source_analysis": str(normalized_analysis.relative_to(ROOT))
                if normalized_analysis.exists()
                else None,
                "raw_source_csv": target["source_csv"],
                "raw_source_analysis": target["source_analysis"],
                "notes": analysis.get("notes"),
            }
        )

    normalized_targets.sort(key=lambda item: (-item["accuracy"], item["name"]))

    data = {
        "schema_version": "3.0",
        "generated_on": date.today().isoformat(),
        "benchmark_date": "2026-05-03",
        "title": "TriageBench Results",
        "description": "Patient-facing triage benchmark across 60 guideline-grounded scenarios.",
        "scenarios_total": len(scenarios),
        "agent_categories": {
            key: {
                "label": AGENT_CATEGORY_LABELS[key],
                "description": AGENT_CATEGORY_DESCRIPTIONS[key],
                "target_count": sum(
                    1
                    for target in normalized_targets
                    if target["agent_category"] == key
                ),
            }
            for key in ["category1", "category2", "category3"]
        },
        "categories": {
            key: {
                "label": label,
                "description": CATEGORY_DESCRIPTIONS[key],
                "total": sum(1 for scenario in scenarios if scenario["category"] == key),
            }
            for key, label in CATEGORY_LABELS.items()
        },
        "targets": normalized_targets,
        "scenario_results": [per_scenario[key] for key in sorted(per_scenario)],
        "raw_data": {
            "scenarios": str(SCENARIOS_PATH.relative_to(ROOT)),
            "archive_root": str(RAW_ROOT.relative_to(ROOT)),
        },
    }

    DOCS_DATA.mkdir(parents=True, exist_ok=True)
    with (DOCS_DATA / "results.json").open("w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    with (DOCS_DATA / "results.js").open("w") as f:
        f.write("window.__TRIAGE_BENCH_RESULTS__ = ")
        json.dump(data, f, separators=(",", ":"))
        f.write(";\n")
    with (DOCS_DATA / "scenarios.json").open("w") as f:
        json.dump(scenarios, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    build()
