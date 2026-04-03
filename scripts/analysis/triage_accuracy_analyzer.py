#!/usr/bin/env python3
"""
TriageBench Triage Accuracy Analyzer

Calculates primary and secondary outcome metrics for healthcare AI triage performance
following the TriageBench V4 paper methodology.

Primary Outcome: Correctness of triage recommendation vs. gold standard
Secondary Outcomes: Overall accuracy, unsafe under-triage, over-triage rates, question burden

Based on: TriageBench V4 paper methodology
Author: Preclinical Analysis Scripts
"""

import csv
from typing import Dict, List, Any, Tuple, Optional
from dataclasses import dataclass
from enum import Enum
import pandas as pd
import numpy as np
from pathlib import Path

from .transcript_processor import ConversationMetrics
from .recommendation_classifier import ClassificationResult, TriageLevel


@dataclass
class TriageBenchCase:
    """TriageBench test case data"""
    case_id: int
    gold_standard: str
    initial_message: str
    clinical_facts: str


@dataclass
class TriageOutcome:
    """Individual triage outcome analysis"""
    case_id: int
    gold_standard: TriageLevel
    predicted: TriageLevel
    is_correct: bool
    is_under_triage: bool
    is_over_triage: bool
    confidence_score: float

    # Conversation metrics
    response_turns: int
    question_count: int
    word_count: int
    readability_score: float
    critical_questions: int


@dataclass
class CohortMetrics:
    """Aggregated metrics for a cohort (platform/agent type)"""
    cohort_name: str
    total_cases: int

    # Primary outcomes
    overall_accuracy: float          # Percentage of correct triage decisions

    # Secondary outcomes - Safety metrics
    under_triage_rate: float         # Emergency cases → lower acuity (dangerous)
    over_triage_rate: float          # Non-emergency → emergency (wasteful but safer)

    # Secondary outcomes - Information gathering
    avg_response_turns: float        # Average agent responses per case
    avg_questions: float             # Average discrete questions per case
    avg_word_count: float           # Average words per case
    avg_readability: float          # Average Flesch-Kincaid grade level
    avg_critical_questions: float   # Average critical/red-flag questions

    # Detailed breakdowns
    emergency_accuracy: float       # Accuracy on emergency cases
    clinician_accuracy: float       # Accuracy on clinician evaluation cases
    home_care_accuracy: float       # Accuracy on home care cases

    # Question burden by gold standard
    emergency_questions: float      # Avg questions for emergency cases
    clinician_questions: float      # Avg questions for clinician cases
    home_care_questions: float      # Avg questions for home care cases


class TriageAccuracyAnalyzer:
    """
    Analyze triage accuracy and performance metrics following TriageBench methodology.
    """

    def __init__(self, triageBench_cases_path: str):
        """
        Initialize analyzer with TriageBench cases data.

        Args:
            triageBench_cases_path: Path to TriageBenchCases.csv file
        """
        self.cases_data = self._load_triageBench_cases(triageBench_cases_path)
        self.gold_standard_map = {case.case_id: case for case in self.cases_data}

    def _load_triageBench_cases(self, cases_path: str) -> List[TriageBenchCase]:
        """Load TriageBench cases from CSV file."""
        cases = []

        with open(cases_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                case = TriageBenchCase(
                    case_id=int(row['case_id']),
                    gold_standard=row['gold_standard'].strip(),
                    initial_message=row['initial_message'].strip(),
                    clinical_facts=row['clinical_facts'].strip()
                )
                cases.append(case)

        return cases

    def analyze_outcomes(self,
                        results: List[Tuple[int, ConversationMetrics, ClassificationResult]]) -> List[TriageOutcome]:
        """
        Analyze individual triage outcomes.

        Args:
            results: List of (case_id, conversation_metrics, classification_result) tuples

        Returns:
            List of TriageOutcome objects
        """
        outcomes = []

        for case_id, conv_metrics, classification in results:
            if case_id not in self.gold_standard_map:
                print(f"Warning: Case ID {case_id} not found in TriageBench cases")
                continue

            gold_case = self.gold_standard_map[case_id]
            gold_level = self._parse_gold_standard(gold_case.gold_standard)
            predicted_level = classification.classified_level

            # Calculate outcome metrics
            is_correct = (predicted_level == gold_level)
            is_under_triage, is_over_triage = self._calculate_triage_safety(gold_level, predicted_level)

            outcome = TriageOutcome(
                case_id=case_id,
                gold_standard=gold_level,
                predicted=predicted_level,
                is_correct=is_correct,
                is_under_triage=is_under_triage,
                is_over_triage=is_over_triage,
                confidence_score=classification.confidence_score,
                response_turns=conv_metrics.response_turns,
                question_count=conv_metrics.question_count,
                word_count=conv_metrics.word_count,
                readability_score=conv_metrics.readability_score,
                critical_questions=conv_metrics.critical_questions
            )

            outcomes.append(outcome)

        return outcomes

    def _parse_gold_standard(self, gold_standard: str) -> TriageLevel:
        """Parse gold standard string to TriageLevel enum."""
        gold_standard = gold_standard.strip()

        if gold_standard == "911":
            return TriageLevel.EMERGENCY
        elif gold_standard == "Clinician":
            return TriageLevel.CLINICIAN
        elif gold_standard == "Home care":
            return TriageLevel.HOME_CARE
        else:
            # Default mapping for unknown values
            if "911" in gold_standard or "Emergency" in gold_standard:
                return TriageLevel.EMERGENCY
            elif "Clinician" in gold_standard:
                return TriageLevel.CLINICIAN
            else:
                return TriageLevel.HOME_CARE

    def _calculate_triage_safety(self, gold_level: TriageLevel, predicted_level: TriageLevel) -> Tuple[bool, bool]:
        """
        Calculate under-triage and over-triage flags.

        Under-triage: Emergency case predicted as lower acuity (dangerous)
        Over-triage: Non-emergency case predicted as emergency (wasteful but safer)
        """
        is_under_triage = (gold_level == TriageLevel.EMERGENCY and
                          predicted_level in [TriageLevel.CLINICIAN, TriageLevel.HOME_CARE])

        is_over_triage = (predicted_level == TriageLevel.EMERGENCY and
                         gold_level in [TriageLevel.CLINICIAN, TriageLevel.HOME_CARE])

        return is_under_triage, is_over_triage

    def calculate_cohort_metrics(self, outcomes: List[TriageOutcome], cohort_name: str) -> CohortMetrics:
        """
        Calculate aggregated metrics for a cohort.

        Args:
            outcomes: List of individual outcomes for this cohort
            cohort_name: Name identifier for the cohort

        Returns:
            CohortMetrics with aggregated statistics
        """
        if not outcomes:
            return self._empty_cohort_metrics(cohort_name)

        total_cases = len(outcomes)

        # Primary outcome: Overall accuracy
        correct_count = sum(1 for outcome in outcomes if outcome.is_correct)
        overall_accuracy = (correct_count / total_cases) * 100

        # Secondary outcomes: Safety metrics
        under_triage_count = sum(1 for outcome in outcomes if outcome.is_under_triage)
        over_triage_count = sum(1 for outcome in outcomes if outcome.is_over_triage)
        under_triage_rate = (under_triage_count / total_cases) * 100
        over_triage_rate = (over_triage_count / total_cases) * 100

        # Information gathering metrics
        avg_response_turns = np.mean([outcome.response_turns for outcome in outcomes])
        avg_questions = np.mean([outcome.question_count for outcome in outcomes])
        avg_word_count = np.mean([outcome.word_count for outcome in outcomes])
        avg_readability = np.mean([outcome.readability_score for outcome in outcomes])
        avg_critical_questions = np.mean([outcome.critical_questions for outcome in outcomes])

        # Accuracy by gold standard category
        emergency_outcomes = [o for o in outcomes if o.gold_standard == TriageLevel.EMERGENCY]
        clinician_outcomes = [o for o in outcomes if o.gold_standard == TriageLevel.CLINICIAN]
        home_care_outcomes = [o for o in outcomes if o.gold_standard == TriageLevel.HOME_CARE]

        emergency_accuracy = self._calculate_category_accuracy(emergency_outcomes)
        clinician_accuracy = self._calculate_category_accuracy(clinician_outcomes)
        home_care_accuracy = self._calculate_category_accuracy(home_care_outcomes)

        # Question burden by gold standard
        emergency_questions = np.mean([o.question_count for o in emergency_outcomes]) if emergency_outcomes else 0
        clinician_questions = np.mean([o.question_count for o in clinician_outcomes]) if clinician_outcomes else 0
        home_care_questions = np.mean([o.question_count for o in home_care_outcomes]) if home_care_outcomes else 0

        return CohortMetrics(
            cohort_name=cohort_name,
            total_cases=total_cases,
            overall_accuracy=overall_accuracy,
            under_triage_rate=under_triage_rate,
            over_triage_rate=over_triage_rate,
            avg_response_turns=avg_response_turns,
            avg_questions=avg_questions,
            avg_word_count=avg_word_count,
            avg_readability=avg_readability,
            avg_critical_questions=avg_critical_questions,
            emergency_accuracy=emergency_accuracy,
            clinician_accuracy=clinician_accuracy,
            home_care_accuracy=home_care_accuracy,
            emergency_questions=emergency_questions,
            clinician_questions=clinician_questions,
            home_care_questions=home_care_questions
        )

    def _calculate_category_accuracy(self, outcomes: List[TriageOutcome]) -> float:
        """Calculate accuracy for a specific gold standard category."""
        if not outcomes:
            return 0.0

        correct_count = sum(1 for outcome in outcomes if outcome.is_correct)
        return (correct_count / len(outcomes)) * 100

    def _empty_cohort_metrics(self, cohort_name: str) -> CohortMetrics:
        """Create empty metrics object for cohorts with no data."""
        return CohortMetrics(
            cohort_name=cohort_name,
            total_cases=0,
            overall_accuracy=0.0,
            under_triage_rate=0.0,
            over_triage_rate=0.0,
            avg_response_turns=0.0,
            avg_questions=0.0,
            avg_word_count=0.0,
            avg_readability=0.0,
            avg_critical_questions=0.0,
            emergency_accuracy=0.0,
            clinician_accuracy=0.0,
            home_care_accuracy=0.0,
            emergency_questions=0.0,
            clinician_questions=0.0,
            home_care_questions=0.0
        )

    def generate_confusion_matrix(self, outcomes: List[TriageOutcome]) -> pd.DataFrame:
        """
        Generate confusion matrix for triage predictions.

        Returns:
            pandas DataFrame with confusion matrix
        """
        # Create mapping for consistent ordering
        level_order = [TriageLevel.EMERGENCY, TriageLevel.CLINICIAN, TriageLevel.HOME_CARE]
        level_names = ["Emergency", "Clinician", "Home care"]

        # Initialize matrix
        matrix = np.zeros((3, 3), dtype=int)

        for outcome in outcomes:
            gold_idx = level_order.index(outcome.gold_standard)
            pred_idx = level_order.index(outcome.predicted)
            matrix[gold_idx][pred_idx] += 1

        # Create DataFrame with proper labels
        df = pd.DataFrame(matrix,
                         index=level_names,
                         columns=level_names)
        df.index.name = "Gold Standard"
        df.columns.name = "Predicted"

        return df

    def generate_performance_report(self, cohort_metrics: List[CohortMetrics]) -> str:
        """
        Generate formatted performance report following TriageBench paper format.

        Args:
            cohort_metrics: List of CohortMetrics for different cohorts/platforms

        Returns:
            Formatted report string
        """
        report_lines = []
        report_lines.append("TriageBench Analysis Performance Report")
        report_lines.append("=" * 50)
        report_lines.append("")

        # Table 1: Platform-Level Performance Metrics
        report_lines.append("Table 1: Platform-Level Performance Metrics")
        report_lines.append("-" * 80)
        header = f"{'Cohort':<15} {'Accuracy':<10} {'Under-triage':<12} {'Over-triage':<12} {'Avg Questions':<13} {'Avg Word Count':<15} {'Reading Grade':<12}"
        report_lines.append(header)
        report_lines.append("-" * 80)

        for metrics in cohort_metrics:
            row = f"{metrics.cohort_name:<15} {metrics.overall_accuracy:<10.1f} {metrics.under_triage_rate:<12.1f} {metrics.over_triage_rate:<12.1f} {metrics.avg_questions:<13.1f} {metrics.avg_word_count:<15.1f} {metrics.avg_readability:<12.1f}"
            report_lines.append(row)

        report_lines.append("")

        # Table 2: Accuracy by Category
        report_lines.append("Table 2: Accuracy by Gold Standard Category")
        report_lines.append("-" * 60)
        header2 = f"{'Cohort':<15} {'Emergency':<12} {'Clinician':<12} {'Home Care':<12}"
        report_lines.append(header2)
        report_lines.append("-" * 60)

        for metrics in cohort_metrics:
            row2 = f"{metrics.cohort_name:<15} {metrics.emergency_accuracy:<12.1f} {metrics.clinician_accuracy:<12.1f} {metrics.home_care_accuracy:<12.1f}"
            report_lines.append(row2)

        report_lines.append("")

        # Table 3: Question Burden by Category
        report_lines.append("Table 3: Average Questions by Gold Standard Category")
        report_lines.append("-" * 60)
        header3 = f"{'Cohort':<15} {'Emergency':<12} {'Clinician':<12} {'Home Care':<12}"
        report_lines.append(header3)
        report_lines.append("-" * 60)

        for metrics in cohort_metrics:
            row3 = f"{metrics.cohort_name:<15} {metrics.emergency_questions:<12.1f} {metrics.clinician_questions:<12.1f} {metrics.home_care_questions:<12.1f}"
            report_lines.append(row3)

        report_lines.append("")

        # Summary statistics
        if cohort_metrics:
            avg_accuracy = np.mean([m.overall_accuracy for m in cohort_metrics])
            avg_under_triage = np.mean([m.under_triage_rate for m in cohort_metrics])
            avg_over_triage = np.mean([m.over_triage_rate for m in cohort_metrics])

            report_lines.append("Summary Statistics")
            report_lines.append("-" * 25)
            report_lines.append(f"Average Overall Accuracy: {avg_accuracy:.1f}%")
            report_lines.append(f"Average Under-triage Rate: {avg_under_triage:.1f}%")
            report_lines.append(f"Average Over-triage Rate: {avg_over_triage:.1f}%")

        return "\n".join(report_lines)


def main():
    """Example usage and testing"""
    # This would typically be called with real data
    print("TriageBench Triage Accuracy Analyzer")
    print("This module processes conversation and classification results to generate")
    print("TriageBench-style performance metrics and reports.")
    print("\nTo use:")
    print("1. Load TriageBench cases with analyzer = TriageAccuracyAnalyzer('path/to/TriageBenchCases.csv')")
    print("2. Process outcomes with analyzer.analyze_outcomes(results)")
    print("3. Calculate cohort metrics with analyzer.calculate_cohort_metrics(outcomes, 'cohort_name')")
    print("4. Generate reports with analyzer.generate_performance_report([cohort_metrics])")


if __name__ == "__main__":
    main()
