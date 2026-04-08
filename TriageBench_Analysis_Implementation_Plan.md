# TriageBench Analysis Implementation Plan

## Overview

Based on the TriageBench V4 paper analysis, we need to implement comprehensive analysis scripts that process healthcare AI agent test transcripts and generate the same performance metrics used in the research study. This will enable systematic evaluation of triage recommendation safety and effectiveness.

## Data Structure Analysis

### Input Data Format
- **Test Cases**: 60 unique cases (20 Emergency care, 20 Clinician evaluation, 20 Home care)
- **Case Structure**: CSV with columns: `case_id`, `gold_standard`, `initial_message`, `clinical_facts`
- **Transcript Data**: Complete conversation transcripts from agent testing runs
- **Expected Output**: Final triage recommendation (Emergency care, Clinician evaluation, Home care)

### Required Analysis Categories
1. **Commercial Triage Platforms**: Specialized healthcare triage systems
2. **General-Purpose Chatbots**: AI assistants used for health information

## Implementation Requirements

### 1. Data Collection and Preprocessing Scripts

#### Script: `transcript_processor.py`
**Purpose**: Extract key metrics from raw conversation transcripts

**Key Metrics to Extract**:
- Complete conversation transcript
- Final triage recommendation (map to 3-tier taxonomy)
- Number of model response turns before recommendation
- Number of discrete question items asked by system
- Total word count of all model-generated text
- Flesch-Kincaid readability grade level of patient-facing text

**Implementation Details**:
```python
def process_transcript(transcript_data):
    """
    Extract analysis metrics from conversation transcript

    Returns:
    {
        'final_recommendation': str,  # Emergency care | Clinician evaluation | Home care
        'response_turns': int,        # Number of model responses
        'question_count': int,        # Discrete questions asked
        'word_count': int,           # Total model-generated words
        'readability_score': float,   # Flesch-Kincaid grade level
        'transcript': str            # Full conversation text
    }
    """
```

#### Script: `recommendation_classifier.py`
**Purpose**: Map platform outputs to standardized 3-tier taxonomy

**Classification Rules**:
- **Emergency care**: ED evaluation, emergency services, 911 recommendations
- **Clinician evaluation**: Urgent care, clinic evaluation, telehealth without emergency referral
- **Home care**: Self-care without clinician evaluation

### 2. Performance Analysis Scripts

#### Script: `triage_accuracy_analyzer.py`
**Purpose**: Calculate primary and secondary outcome metrics

**Primary Outcome**:
- Correctness of triage recommendation vs. gold standard

**Secondary Outcomes**:
- Overall triage accuracy by platform and cohort
- Unsafe under-triage rate (Emergency cases → lower acuity)
- Over-triage rate (non-Emergency cases → Emergency)
- Information-gathering adequacy
- Question burden analysis

#### Script: `confusion_matrix_generator.py`
**Purpose**: Generate confusion matrices and distribution analysis

**Outputs**:
- Platform-level confusion matrices (3x3)
- Cohort-level performance comparisons
- Triage category distribution charts

#### Script: `intake_behavior_analyzer.py`
**Purpose**: Analyze information-gathering patterns

**Metrics**:
- Average questions asked per case
- Average word count per interaction
- Critical red-flag coverage percentage
- Reading grade level by cohort

### 3. Statistical Analysis and Reporting

#### Script: `statistical_analyzer.py`
**Purpose**: Generate comprehensive performance reports

**Key Analysis Tables**:

**Table 1: Platform-Level Performance Metrics**
```
Platform | Cohort | Accuracy | Under-triage | Over-triage | Avg Questions | Avg Word Count | Reading Grade Level
```

**Table 2: Confusion Matrix (Counts)**
```
Cohort | Reference Category | Predicted Emergency | Predicted Clinician | Predicted Home
```

**Table 3: Intake Behavior Metrics by Cohort**
```
Cohort | Avg Questions | Avg Word Count | Critical Red-flag Coverage (%) | Avg Reading Grade Level
```

#### Script: `visualization_generator.py`
**Purpose**: Create charts and visualizations

**Required Charts**:
- Distribution of Recommended Triage Categories by Cohort and Reference Case
- Triage Accuracy and Safety Metrics by Cohort
- Intake Behavior Metrics by Cohort

### 4. Integration with Preclinical Platform

#### Integration Points:
1. **Run Results Processing**: Hook into existing run completion workflow
2. **Database Schema**: Extend results tables to store analysis metrics
3. **API Endpoints**: Expose analysis results via REST API
4. **Frontend Dashboard**: Display analysis results in UI

#### Database Schema Extensions:
```sql
-- New table for storing analysis results
CREATE TABLE triage_analysis_results (
    id SERIAL PRIMARY KEY,
    run_id VARCHAR REFERENCES runs(id),
    case_id VARCHAR NOT NULL,
    gold_standard VARCHAR NOT NULL,
    predicted_recommendation VARCHAR NOT NULL,
    is_correct BOOLEAN NOT NULL,
    is_under_triage BOOLEAN NOT NULL,
    is_over_triage BOOLEAN NOT NULL,
    response_turns INTEGER NOT NULL,
    question_count INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    readability_score FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Summary table for cohort analysis
CREATE TABLE triage_cohort_analysis (
    id SERIAL PRIMARY KEY,
    run_id VARCHAR REFERENCES runs(id),
    cohort_type VARCHAR NOT NULL, -- 'commercial' or 'chatbot'
    overall_accuracy FLOAT NOT NULL,
    under_triage_rate FLOAT NOT NULL,
    over_triage_rate FLOAT NOT NULL,
    avg_questions FLOAT NOT NULL,
    avg_word_count FLOAT NOT NULL,
    avg_readability FLOAT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 5. Implementation Priority

#### Phase 1 (Core Analysis):
1. `transcript_processor.py` - Extract basic metrics
2. `recommendation_classifier.py` - Standardize recommendations
3. `triage_accuracy_analyzer.py` - Calculate accuracy metrics

#### Phase 2 (Advanced Analysis):
1. `confusion_matrix_generator.py` - Generate confusion matrices
2. `intake_behavior_analyzer.py` - Analyze questioning patterns
3. `statistical_analyzer.py` - Comprehensive reporting

#### Phase 3 (Integration):
1. Database schema updates
2. API endpoint development
3. Frontend dashboard integration
4. `visualization_generator.py` - Charts and graphs

### 6. Testing Requirements

#### Unit Tests:
- Test each analysis function with sample data
- Validate metric calculations against paper examples
- Test edge cases (incomplete transcripts, malformed data)

#### Integration Tests:
- End-to-end analysis pipeline testing
- Database integration testing
- API endpoint testing

#### Validation Tests:
- Compare results with paper's example data
- Cross-validate with manual analysis on subset
- Performance testing with large datasets

### 7. Dependencies and Tools

#### Required Libraries:
- **Text Analysis**: `textstat` (Flesch-Kincaid), `nltk`, `spacy`
- **Statistical Analysis**: `pandas`, `numpy`, `scipy`
- **Visualization**: `matplotlib`, `seaborn`, `plotly`
- **Database**: `psycopg2`, `sqlalchemy`
- **Testing**: `pytest`, `unittest`

#### External Dependencies:
- Access to run transcripts and results
- TriageBench case data (provided CSV)
- Integration with existing Preclinical API

### 8. Delivery Timeline

#### Week 1: Phase 1 Implementation
- Core transcript processing and classification
- Basic accuracy calculations
- Unit tests for core functions

#### Week 2: Phase 2 Implementation
- Advanced statistical analysis
- Confusion matrices and reporting
- Integration tests

#### Week 3: Phase 3 Implementation
- Database integration
- API endpoints
- Frontend dashboard updates

#### Week 4: Testing and Validation
- Comprehensive testing
- Performance optimization
- Documentation and deployment

### 9. Success Criteria

1. **Accuracy**: Analysis results match paper methodology
2. **Performance**: Process large datasets efficiently (>1000 transcripts)
3. **Integration**: Seamless integration with existing platform
4. **Usability**: Clear dashboards and reports for stakeholders
5. **Validation**: Results validated against known benchmarks

### 10. Documentation Requirements

1. **API Documentation**: All endpoints and response formats
2. **Analysis Guide**: How to interpret results and metrics
3. **Developer Guide**: Setup and deployment instructions
4. **User Manual**: Dashboard usage and report interpretation

## Next Steps

1. Review this plan with the development team
2. Set up development environment with required dependencies
3. Begin Phase 1 implementation with transcript processor
4. Create sample data for testing and validation
5. Establish CI/CD pipeline for continuous testing

## Questions for Clarification

1. What is the current format/schema of transcript data in the system?
2. Are there existing API endpoints for accessing run results?
3. What visualization framework is preferred for the dashboard?
4. Are there specific performance requirements for large-scale analysis?
5. What level of real-time vs. batch processing is needed?