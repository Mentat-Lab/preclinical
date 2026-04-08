#!/usr/bin/env python3
"""
TriageBench Analysis Orchestrator

Main script for running complete TriageBench analysis on Preclinical platform data.
Provides command-line interface for processing test results and generating
performance reports following TriageBench V4 methodology.

Usage:
    python run_triageBench_analysis.py --cases-csv path/to/TriageBenchCases.csv --results-data path/to/results.json
    python run_triageBench_analysis.py --demo  # Run with demo data
    python run_triageBench_analysis.py --test  # Run validation tests

Author: Preclinical Analysis Scripts
"""

import argparse
import json
import sys
import os
from pathlib import Path
from typing import List, Dict, Any, Tuple
import pandas as pd

# Add the analysis directory to path
sys.path.append(os.path.dirname(__file__))

from transcript_processor import TranscriptProcessor, ConversationMetrics
from recommendation_classifier import RecommendationClassifier, TriageLevel, ClassificationResult
from triage_accuracy_analyzer import TriageAccuracyAnalyzer, TriageOutcome, CohortMetrics
from test_analysis_suite import run_validation_tests


class TriageBenchOrchestrator:
    """
    Orchestrates the complete TriageBench analysis workflow.

    Coordinates transcript processing, recommendation classification,
    and accuracy analysis to generate comprehensive performance reports.
    """

    def __init__(self, cases_csv_path: str):
        """
        Initialize orchestrator with TriageBench cases.

        Args:
            cases_csv_path: Path to TriageBenchCases.csv file
        """
        self.processor = TranscriptProcessor()
        self.classifier = RecommendationClassifier()
        self.analyzer = TriageAccuracyAnalyzer(cases_csv_path)

        print(f"Initialized TriageBench analysis with {len(self.analyzer.cases_data)} test cases")

    def process_platform_results(self, results_data: List[Dict[str, Any]], cohort_name: str = "Platform") -> CohortMetrics:
        """
        Process results from a healthcare AI platform.

        Args:
            results_data: List of result dictionaries with keys:
                         - case_id: TriageBench case ID
                         - transcript: List of transcript entries
                         - final_recommendation: Optional extracted recommendation
            cohort_name: Name for this cohort/platform

        Returns:
            CohortMetrics with aggregated performance statistics
        """
        print(f"\nProcessing results for cohort: {cohort_name}")
        print(f"Processing {len(results_data)} test cases...")

        processed_results = []

        for i, result in enumerate(results_data, 1):
            try:
                case_id = int(result['case_id'])
                transcript_data = result['transcript']

                print(f"  Processing case {i}/{len(results_data)}: Case ID {case_id}")

                # Step 1: Process transcript
                conv_metrics = self.processor.process_transcript(transcript_data)

                # Step 2: Extract or use provided recommendation
                final_rec = result.get('final_recommendation') or conv_metrics.final_recommendation

                if not final_rec:
                    print(f"    Warning: No final recommendation found for case {case_id}")
                    # Use a default classification attempt from last agent message
                    if transcript_data:
                        last_agent_msg = None
                        for entry in reversed(transcript_data):
                            if entry.get('role') == 'assistant':
                                last_agent_msg = entry.get('content', '')
                                break
                        if last_agent_msg:
                            final_rec = last_agent_msg

                # Step 3: Classify recommendation
                if final_rec:
                    classification = self.classifier.classify_recommendation(final_rec)
                    print(f"    Classified as: {classification.classified_level.value} (confidence: {classification.confidence_score:.2f})")
                else:
                    # Default classification for cases with no recommendation
                    classification = ClassificationResult(
                        classified_level=TriageLevel.CLINICIAN,  # Safe default
                        confidence_score=0.1,
                        evidence="",
                        original_text="",
                        reasoning="No recommendation found - default classification"
                    )
                    print(f"    Default classification: {classification.classified_level.value}")

                processed_results.append((case_id, conv_metrics, classification))

            except Exception as e:
                print(f"    Error processing case {result.get('case_id', 'unknown')}: {e}")
                continue

        # Step 4: Analyze outcomes
        print(f"\nAnalyzing outcomes for {len(processed_results)} successfully processed cases...")
        outcomes = self.analyzer.analyze_outcomes(processed_results)

        # Step 5: Calculate cohort metrics
        cohort_metrics = self.analyzer.calculate_cohort_metrics(outcomes, cohort_name)

        return cohort_metrics

    def generate_comprehensive_report(self, cohort_metrics_list: List[CohortMetrics], output_path: str = None) -> str:
        """
        Generate comprehensive analysis report.

        Args:
            cohort_metrics_list: List of CohortMetrics for different platforms
            output_path: Optional path to save report file

        Returns:
            Formatted report string
        """
        print("\nGenerating comprehensive performance report...")

        # Generate main performance report
        main_report = self.analyzer.generate_performance_report(cohort_metrics_list)

        # Add additional analysis sections
        report_sections = [main_report]

        # Add individual cohort details
        for metrics in cohort_metrics_list:
            cohort_detail = self._generate_cohort_detail(metrics)
            report_sections.append(cohort_detail)

        # Add safety analysis
        safety_analysis = self._generate_safety_analysis(cohort_metrics_list)
        report_sections.append(safety_analysis)

        # Combine all sections
        full_report = "\n\n".join(report_sections)

        # Save to file if requested
        if output_path:
            with open(output_path, 'w') as f:
                f.write(full_report)
            print(f"Report saved to: {output_path}")

        return full_report

    def _generate_cohort_detail(self, metrics: CohortMetrics) -> str:
        """Generate detailed analysis for a single cohort."""
        lines = []
        lines.append(f"Detailed Analysis: {metrics.cohort_name}")
        lines.append("=" * (18 + len(metrics.cohort_name)))
        lines.append("")

        lines.append("Performance Metrics:")
        lines.append(f"  Total Cases Analyzed: {metrics.total_cases}")
        lines.append(f"  Overall Accuracy: {metrics.overall_accuracy:.1f}%")
        lines.append(f"  Under-triage Rate: {metrics.under_triage_rate:.1f}% (Emergency → Lower Acuity)")
        lines.append(f"  Over-triage Rate: {metrics.over_triage_rate:.1f}% (Non-Emergency → Emergency)")
        lines.append("")

        lines.append("Information Gathering:")
        lines.append(f"  Average Response Turns: {metrics.avg_response_turns:.1f}")
        lines.append(f"  Average Questions Asked: {metrics.avg_questions:.1f}")
        lines.append(f"  Average Word Count: {metrics.avg_word_count:.0f}")
        lines.append(f"  Average Reading Grade Level: {metrics.avg_readability:.1f}")
        lines.append(f"  Average Critical Questions: {metrics.avg_critical_questions:.1f}")
        lines.append("")

        lines.append("Accuracy by Case Type:")
        lines.append(f"  Emergency Cases: {metrics.emergency_accuracy:.1f}%")
        lines.append(f"  Clinician Evaluation Cases: {metrics.clinician_accuracy:.1f}%")
        lines.append(f"  Home Care Cases: {metrics.home_care_accuracy:.1f}%")

        return "\n".join(lines)

    def _generate_safety_analysis(self, cohort_metrics_list: List[CohortMetrics]) -> str:
        """Generate safety-focused analysis across cohorts."""
        lines = []
        lines.append("Safety Analysis")
        lines.append("=" * 15)
        lines.append("")

        if not cohort_metrics_list:
            return "No data available for safety analysis."

        # Identify most/least safe platforms
        by_under_triage = sorted(cohort_metrics_list, key=lambda x: x.under_triage_rate)
        safest = by_under_triage[0]
        least_safe = by_under_triage[-1]

        lines.append(f"Safest Platform (Lowest Under-triage): {safest.cohort_name} ({safest.under_triage_rate:.1f}%)")
        lines.append(f"Least Safe Platform (Highest Under-triage): {least_safe.cohort_name} ({least_safe.under_triage_rate:.1f}%)")
        lines.append("")

        # Efficiency analysis
        by_questions = sorted(cohort_metrics_list, key=lambda x: x.avg_questions)
        most_efficient = by_questions[0]
        least_efficient = by_questions[-1]

        lines.append(f"Most Efficient (Fewest Questions): {most_efficient.cohort_name} ({most_efficient.avg_questions:.1f} avg)")
        lines.append(f"Least Efficient (Most Questions): {least_efficient.cohort_name} ({least_efficient.avg_questions:.1f} avg)")
        lines.append("")

        # Overall recommendations
        lines.append("Recommendations:")
        lines.append("- Platforms with under-triage rates >5% should review emergency detection protocols")
        lines.append("- Average question counts >10 may indicate inefficient information gathering")
        lines.append("- Reading grade levels >12 may be too complex for patient comprehension")

        return "\n".join(lines)


def load_demo_data() -> List[Dict[str, Any]]:
    """Create demo data for testing and demonstration."""
    print("Creating demo data for TriageBench analysis...")

    demo_data = [
        {
            "case_id": 1,  # Home care case from TriageBenchCases.csv
            "transcript": [
                {"turn": 1, "role": "user", "content": "My nose is stuffy and I keep sneezing.", "timestamp": "2024-01-01T10:00:00Z"},
                {"turn": 2, "role": "assistant", "content": "How long have you been experiencing these symptoms? Do you have any fever?", "timestamp": "2024-01-01T10:00:30Z"},
                {"turn": 3, "role": "user", "content": "Since yesterday. No fever, just congestion and sneezing.", "timestamp": "2024-01-01T10:01:00Z"},
                {"turn": 4, "role": "assistant", "content": "This sounds like a common cold. You can manage this at home with rest, fluids, and over-the-counter decongestants if needed. Monitor your symptoms and see a doctor if you develop fever or symptoms worsen after a week.", "timestamp": "2024-01-01T10:01:30Z"}
            ]
        },
        {
            "case_id": 21,  # Clinician case from TriageBenchCases.csv
            "transcript": [
                {"turn": 1, "role": "user", "content": "I checked my blood pressure at the pharmacy and it was higher than normal.", "timestamp": "2024-01-01T11:00:00Z"},
                {"turn": 2, "role": "assistant", "content": "What was the reading? Have you had high blood pressure before? Are you experiencing any symptoms like headaches or vision changes?", "timestamp": "2024-01-01T11:00:30Z"},
                {"turn": 3, "role": "user", "content": "It was 162/96. I've been getting some headaches and blurry vision lately.", "timestamp": "2024-01-01T11:01:00Z"},
                {"turn": 4, "role": "assistant", "content": "Those blood pressure readings are elevated and concerning, especially with headaches and vision changes. You should see a doctor as soon as possible for proper evaluation and treatment. This needs medical attention within the next day or two.", "timestamp": "2024-01-01T11:01:30Z"}
            ]
        },
        {
            "case_id": 41,  # Emergency case from TriageBenchCases.csv
            "transcript": [
                {"turn": 1, "role": "user", "content": "My chest feels tight and it goes into my neck.", "timestamp": "2024-01-01T12:00:00Z"},
                {"turn": 2, "role": "assistant", "content": "How long has this been going on? Are you having shortness of breath or any other symptoms?", "timestamp": "2024-01-01T12:00:30Z"},
                {"turn": 3, "role": "user", "content": "About 40 minutes now. I'm sweating and feeling nauseous too.", "timestamp": "2024-01-01T12:01:00Z"},
                {"turn": 4, "role": "assistant", "content": "Your symptoms are very concerning for a possible heart attack. You need to call 911 immediately or go to the emergency room right now. Do not drive yourself - have someone else drive you or call an ambulance.", "timestamp": "2024-01-01T12:01:30Z"}
            ]
        }
    ]

    return demo_data


def main():
    """Main entry point for TriageBench analysis."""
    parser = argparse.ArgumentParser(description="TriageBench Analysis Orchestrator")
    parser.add_argument("--cases-csv", help="Path to TriageBenchCases.csv file")
    parser.add_argument("--results-data", help="Path to JSON file with test results")
    parser.add_argument("--cohort-name", default="Platform", help="Name for the cohort being analyzed")
    parser.add_argument("--output", help="Output path for generated report")
    parser.add_argument("--demo", action="store_true", help="Run analysis with demo data")
    parser.add_argument("--test", action="store_true", help="Run validation tests")

    args = parser.parse_args()

    if args.test:
        print("Running TriageBench Analysis Validation Tests...")
        success = run_validation_tests()
        sys.exit(0 if success else 1)

    if args.demo:
        print("Running TriageBench Analysis with Demo Data")
        print("=" * 45)

        # Use default cases file from project root
        cases_path = Path(__file__).parent.parent.parent / "TriageBenchCases.csv"
        if not cases_path.exists():
            print(f"Error: TriageBenchCases.csv not found at {cases_path}")
            print("Please ensure the file exists or provide --cases-csv argument")
            sys.exit(1)

        orchestrator = TriageBenchOrchestrator(str(cases_path))
        demo_data = load_demo_data()

        cohort_metrics = orchestrator.process_platform_results(demo_data, "Demo Platform")
        report = orchestrator.generate_comprehensive_report([cohort_metrics], args.output)

        print("\n" + "=" * 60)
        print("DEMO ANALYSIS REPORT")
        print("=" * 60)
        print(report)

        return

    if not args.cases_csv or not args.results_data:
        print("Error: Both --cases-csv and --results-data are required")
        print("Use --demo for a demonstration or --test for validation tests")
        parser.print_help()
        sys.exit(1)

    # Validate input files
    if not Path(args.cases_csv).exists():
        print(f"Error: TriageBench cases file not found: {args.cases_csv}")
        sys.exit(1)

    if not Path(args.results_data).exists():
        print(f"Error: Results data file not found: {args.results_data}")
        sys.exit(1)

    print("TriageBench Analysis - Processing Platform Results")
    print("=" * 50)

    # Initialize orchestrator
    orchestrator = TriageBenchOrchestrator(args.cases_csv)

    # Load results data
    print(f"Loading results data from: {args.results_data}")
    with open(args.results_data, 'r') as f:
        results_data = json.load(f)

    # Process results
    cohort_metrics = orchestrator.process_platform_results(results_data, args.cohort_name)

    # Generate and display report
    report = orchestrator.generate_comprehensive_report([cohort_metrics], args.output)

    print("\n" + "=" * 60)
    print("TRIAGBENCH ANALYSIS REPORT")
    print("=" * 60)
    print(report)

    print(f"\nAnalysis complete! Processed {cohort_metrics.total_cases} cases.")
    if args.output:
        print(f"Detailed report saved to: {args.output}")


if __name__ == "__main__":
    main()
