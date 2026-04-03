# TriageBench Analysis Suite

Comprehensive analysis scripts for healthcare AI triage performance evaluation following the TriageBench V4 paper methodology.

## Overview

This analysis suite implements the complete TriageBench research methodology for evaluating healthcare AI agent triage performance. It processes conversation transcripts from the Preclinical platform and generates standardized performance metrics including:

- **Primary Outcome**: Correctness of triage recommendation vs. gold standard
- **Secondary Outcomes**: Overall accuracy, unsafe under-triage, over-triage rates, question burden
- **Conversation Analysis**: Turn counts, question analysis, readability scoring
- **Statistical Analysis**: Confusion matrices, cohort comparisons

## Architecture

### Core Components

1. **`transcript_processor.py`** - Extracts metrics from conversation transcripts
2. **`recommendation_classifier.py`** - Maps platform outputs to 3-tier taxonomy
3. **`triage_accuracy_analyzer.py`** - Calculates primary/secondary outcomes
4. **`run_triageBench_analysis.py`** - Main orchestrator script
5. **`test_analysis_suite.py`** - Comprehensive testing framework

### Data Flow

```
Preclinical Results → Transcript Processing → Classification → Accuracy Analysis → Report Generation
                   ↓                      ↓                ↓                    ↓
              Conversation Metrics    Triage Level    Outcome Analysis    Performance Report
```

## Installation

### Prerequisites

- Python 3.8 or higher
- Required Python packages (see `requirements.txt`)

### Setup

1. **Install dependencies:**
   ```bash
   cd /path/to/preclinical/scripts/analysis/
   pip install -r requirements.txt
   ```

2. **Verify installation:**
   ```bash
   python run_triageBench_analysis.py --test
   ```

## Usage

### Quick Start - Demo Analysis

Run the analysis with sample data to see how it works:

```bash
python run_triageBench_analysis.py --demo
```

This will:
- Load sample transcript data for 3 test cases
- Process them through the complete analysis pipeline
- Generate a comprehensive performance report

### Analyzing Real Data

#### 1. Prepare Your Data

Create a JSON file with your test results in this format:

```json
[
  {
    "case_id": 1,
    "transcript": [
      {"turn": 1, "role": "user", "content": "Patient message", "timestamp": "2024-01-01T10:00:00Z"},
      {"turn": 2, "role": "assistant", "content": "Agent response", "timestamp": "2024-01-01T10:00:30Z"}
    ],
    "final_recommendation": "Optional: explicit final recommendation text"
  }
]
```

#### 2. Run Analysis

```bash
python run_triageBench_analysis.py \
    --cases-csv /path/to/TriageBenchCases.csv \
    --results-data /path/to/your_results.json \
    --cohort-name "Your Platform Name" \
    --output /path/to/output_report.txt
```

### Command Line Options

- `--cases-csv`: Path to TriageBenchCases.csv (required for real data)
- `--results-data`: Path to JSON file with test results (required for real data)
- `--cohort-name`: Name for the platform/cohort being analyzed (default: "Platform")
- `--output`: Output path for generated report (optional)
- `--demo`: Run with sample data for demonstration
- `--test`: Run comprehensive validation tests

## API Usage

### Individual Components

```python
from analysis import TranscriptProcessor, RecommendationClassifier, TriageAccuracyAnalyzer

# Process individual transcript
processor = TranscriptProcessor()
metrics = processor.process_transcript(transcript_data)

# Classify recommendation
classifier = RecommendationClassifier()
classification = classifier.classify_recommendation("Call 911 immediately")

# Analyze outcomes
analyzer = TriageAccuracyAnalyzer("TriageBenchCases.csv")
outcomes = analyzer.analyze_outcomes(results_list)
cohort_metrics = analyzer.calculate_cohort_metrics(outcomes, "Platform Name")
```

### Full Workflow

```python
from analysis.run_triageBench_analysis import TriageBenchOrchestrator

# Initialize orchestrator
orchestrator = TriageBenchOrchestrator("TriageBenchCases.csv")

# Process platform results
cohort_metrics = orchestrator.process_platform_results(results_data, "Platform Name")

# Generate report
report = orchestrator.generate_comprehensive_report([cohort_metrics], "output_file.txt")
print(report)
```

## Output Format

### Performance Report Structure

1. **Platform-Level Performance Metrics**
   - Overall accuracy, under-triage rate, over-triage rate
   - Average questions, word count, reading grade level

2. **Accuracy by Category**
   - Performance on Emergency, Clinician, and Home Care cases

3. **Question Burden Analysis**
   - Information gathering patterns by case type

4. **Individual Cohort Details**
   - Detailed breakdown for each platform analyzed

5. **Safety Analysis**
   - Safety-focused analysis identifying risks and recommendations

### Sample Output

```
TriageBench Analysis Performance Report
==============================================

Table 1: Platform-Level Performance Metrics
--------------------------------------------------------------------------------
Cohort          Accuracy   Under-triage Over-triage Avg Questions Avg Word Count Reading Grade
Demo Platform   66.7       33.3         0.0         2.7           45.3           8.2

Detailed Analysis: Demo Platform
================================

Performance Metrics:
  Total Cases Analyzed: 3
  Overall Accuracy: 66.7%
  Under-triage Rate: 33.3% (Emergency → Lower Acuity)
  Over-triage Rate: 0.0% (Non-Emergency → Emergency)

Safety Analysis
===============

Recommendations:
- Platforms with under-triage rates >5% should review emergency detection protocols
```

## Testing

### Run All Tests

```bash
python test_analysis_suite.py --run-tests
```

### Generate Sample Data

```bash
python test_analysis_suite.py --create-samples
```

### Test Categories

1. **Unit Tests**: Individual component functionality
2. **Integration Tests**: End-to-end workflow validation
3. **Validation Tests**: Methodology compliance verification

## TriageBench Methodology Compliance

This implementation follows the TriageBench V4 paper methodology:

### Primary Outcome
- **Correctness**: Binary measure of triage recommendation accuracy vs. gold standard

### Secondary Outcomes
- **Overall Accuracy**: Percentage of correct triage decisions
- **Under-triage Rate**: Emergency cases classified as lower acuity (safety risk)
- **Over-triage Rate**: Non-emergency cases classified as emergency (resource waste)
- **Question Burden**: Information gathering efficiency metrics

### 3-Tier Taxonomy
- **Emergency care**: Immediate emergency services (911/ER)
- **Clinician evaluation**: Professional medical assessment needed
- **Home care**: Self-care without professional evaluation

### Conversation Metrics
- Response turns, discrete questions, word count
- Flesch-Kincaid readability grade level
- Critical/red-flag question identification

## Integration with Preclinical Platform

### Database Integration

The analysis scripts can be integrated with the Preclinical platform database:

```sql
-- Example: Extend scenario_runs table for analysis results
ALTER TABLE scenario_runs ADD COLUMN analysis_results JSONB;

-- Store analysis metrics
UPDATE scenario_runs
SET analysis_results = '{
  "response_turns": 4,
  "question_count": 3,
  "word_count": 85,
  "readability_score": 8.2,
  "final_recommendation": "Emergency care",
  "triage_correct": true
}'::jsonb
WHERE id = 'scenario-run-id';
```

### API Endpoints

Suggested API endpoints for platform integration:

```
POST /api/analysis/triageBench
  - Submit test results for TriageBench analysis

GET /api/analysis/triageBench/{runId}
  - Retrieve analysis results for a specific run

GET /api/analysis/triageBench/report/{cohortId}
  - Generate performance report for a cohort
```

## Troubleshooting

### Common Issues

1. **Import Errors**: Ensure all requirements are installed and Python path is set correctly
2. **File Not Found**: Verify TriageBenchCases.csv path is correct
3. **JSON Format Errors**: Ensure results data follows the expected schema
4. **Empty Results**: Check that transcript data contains agent responses

### Debug Mode

Add debugging output to any script:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Validation

Verify your analysis against the paper's examples:

```bash
python run_triageBench_analysis.py --demo  # Should match expected output format
python test_analysis_suite.py --run-tests  # All tests should pass
```

## Contributing

When extending or modifying the analysis scripts:

1. Follow the existing code structure and documentation style
2. Add comprehensive tests for new functionality
3. Ensure compliance with TriageBench methodology
4. Update this README for any API changes

## References

- TriageBench V4 Paper: [Link to paper when published]
- Preclinical Platform Documentation: [Link to platform docs]
- Flesch-Kincaid Readability: https://en.wikipedia.org/wiki/Flesch%E2%80%93Kincaid_readability_tests

## License

This analysis suite is part of the Preclinical project and follows the same Apache 2.0 license.
