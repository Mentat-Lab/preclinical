#!/usr/bin/env python3
"""
TriageBench Analysis Test Suite

Comprehensive testing framework for the TriageBench analysis scripts including:
- Unit tests for individual components
- Integration tests for end-to-end workflow
- Validation tests against TriageBench methodology
- Sample data generation and validation

Author: Preclinical Analysis Scripts
"""

import unittest
import tempfile
import json
import csv
from typing import List, Dict, Any
from pathlib import Path
import sys
import os

# Add the analysis directory to path for imports
sys.path.append(os.path.dirname(__file__))

from transcript_processor import TranscriptProcessor, ConversationMetrics
from recommendation_classifier import RecommendationClassifier, TriageLevel, ClassificationResult
from triage_accuracy_analyzer import TriageAccuracyAnalyzer, TriageOutcome


class TestTranscriptProcessor(unittest.TestCase):
    """Test cases for TranscriptProcessor"""

    def setUp(self):
        """Set up test fixtures"""
        self.processor = TranscriptProcessor()

    def test_basic_transcript_processing(self):
        """Test basic transcript processing functionality"""
        sample_transcript = [
            {"turn": 1, "role": "user", "content": "My chest hurts.", "timestamp": "2024-01-01T10:00:00Z"},
            {"turn": 2, "role": "assistant", "content": "Can you describe the pain? When did it start?", "timestamp": "2024-01-01T10:00:30Z"},
            {"turn": 3, "role": "user", "content": "It's crushing and started an hour ago.", "timestamp": "2024-01-01T10:01:00Z"},
            {"turn": 4, "role": "assistant", "content": "Call 911 immediately.", "timestamp": "2024-01-01T10:01:30Z"}
        ]

        metrics = self.processor.process_transcript(sample_transcript)

        # Validate basic metrics
        self.assertEqual(metrics.response_turns, 2)  # 2 assistant responses
        self.assertEqual(metrics.patient_turns, 2)   # 2 user messages
        self.assertEqual(metrics.conversation_length, 4)  # Total turns
        self.assertGreater(metrics.word_count, 0)    # Should have word count
        self.assertGreaterEqual(metrics.readability_score, 0.0)  # Should have readability

    def test_question_detection(self):
        """Test question detection in agent responses"""
        transcript_with_questions = [
            {"turn": 1, "role": "user", "content": "I feel sick.", "timestamp": "2024-01-01T10:00:00Z"},
            {"turn": 2, "role": "assistant", "content": "What symptoms are you experiencing? Can you describe the pain? When did this start?", "timestamp": "2024-01-01T10:00:30Z"}
        ]

        metrics = self.processor.process_transcript(transcript_with_questions)

        # Should detect multiple questions
        self.assertGreaterEqual(metrics.question_count, 3)

    def test_triage_recommendation_extraction(self):
        """Test extraction of final triage recommendations"""
        emergency_transcript = [
            {"turn": 1, "role": "user", "content": "Chest pain", "timestamp": "2024-01-01T10:00:00Z"},
            {"turn": 2, "role": "assistant", "content": "Call 911 immediately", "timestamp": "2024-01-01T10:00:30Z"}
        ]

        metrics = self.processor.process_transcript(emergency_transcript)
        self.assertEqual(metrics.final_recommendation, "Emergency")

    def test_empty_transcript_handling(self):
        """Test handling of empty or malformed transcripts"""
        empty_transcript = []
        metrics = self.processor.process_transcript(empty_transcript)

        self.assertEqual(metrics.response_turns, 0)
        self.assertEqual(metrics.word_count, 0)
        self.assertIsNone(metrics.final_recommendation)


class TestRecommendationClassifier(unittest.TestCase):
    """Test cases for RecommendationClassifier"""

    def setUp(self):
        """Set up test fixtures"""
        self.classifier = RecommendationClassifier()

    def test_emergency_classification(self):
        """Test classification of emergency recommendations"""
        emergency_texts = [
            "Call 911 immediately",
            "Go to the emergency room right now",
            "This is a life-threatening emergency",
            "You need immediate emergency care"
        ]

        for text in emergency_texts:
            result = self.classifier.classify_recommendation(text)
            self.assertEqual(result.classified_level, TriageLevel.EMERGENCY,
                           f"Failed to classify '{text}' as emergency")
            self.assertGreater(result.confidence_score, 0.5)

    def test_clinician_classification(self):
        """Test classification of clinician evaluation recommendations"""
        clinician_texts = [
            "You should see a doctor",
            "Schedule an appointment with your healthcare provider",
            "Visit urgent care for evaluation",
            "Consult with your physician"
        ]

        for text in clinician_texts:
            result = self.classifier.classify_recommendation(text)
            self.assertEqual(result.classified_level, TriageLevel.CLINICIAN,
                           f"Failed to classify '{text}' as clinician evaluation")

    def test_home_care_classification(self):
        """Test classification of home care recommendations"""
        home_care_texts = [
            "Rest at home and monitor symptoms",
            "Try over-the-counter medication",
            "Self-care should be sufficient",
            "No need for medical attention at this time"
        ]

        for text in home_care_texts:
            result = self.classifier.classify_recommendation(text)
            self.assertEqual(result.classified_level, TriageLevel.HOME_CARE,
                           f"Failed to classify '{text}' as home care")

    def test_confidence_scoring(self):
        """Test confidence scoring accuracy"""
        high_confidence_text = "Call 911 immediately - this is a medical emergency"
        low_confidence_text = "maybe see a doctor"

        high_result = self.classifier.classify_recommendation(high_confidence_text)
        low_result = self.classifier.classify_recommendation(low_confidence_text)

        self.assertGreater(high_result.confidence_score, low_result.confidence_score)

    def test_validation_against_gold_standard(self):
        """Test validation functionality against gold standards"""
        result = ClassificationResult(
            classified_level=TriageLevel.EMERGENCY,
            confidence_score=0.9,
            evidence="call 911",
            original_text="Call 911 immediately",
            reasoning="High confidence emergency classification"
        )

        validation = self.classifier.validate_classification(result, "911")
        self.assertTrue(validation['is_correct'])
        self.assertFalse(validation['is_under_triage'])
        self.assertFalse(validation['is_over_triage'])


class TestTriageAccuracyAnalyzer(unittest.TestCase):
    """Test cases for TriageAccuracyAnalyzer"""

    def setUp(self):
        """Set up test fixtures with sample TriageBench cases"""
        # Create a temporary CSV file with sample cases
        self.temp_csv = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv')
        sample_cases = [
            {"case_id": 1, "gold_standard": "Home care", "initial_message": "My nose is stuffy", "clinical_facts": "32-year-old female; nasal congestion"},
            {"case_id": 2, "gold_standard": "Clinician", "initial_message": "My back hurts", "clinical_facts": "42-year-old male; back pain 7 days"},
            {"case_id": 3, "gold_standard": "911", "initial_message": "Chest pain", "clinical_facts": "58-year-old male; chest pain with radiation"}
        ]

        writer = csv.DictWriter(self.temp_csv, fieldnames=['case_id', 'gold_standard', 'initial_message', 'clinical_facts'])
        writer.writeheader()
        writer.writerows(sample_cases)
        self.temp_csv.close()

        self.analyzer = TriageAccuracyAnalyzer(self.temp_csv.name)

    def tearDown(self):
        """Clean up temporary files"""
        os.unlink(self.temp_csv.name)

    def test_case_loading(self):
        """Test loading of TriageBench cases"""
        self.assertEqual(len(self.analyzer.cases_data), 3)
        self.assertIn(1, self.analyzer.gold_standard_map)
        self.assertIn(2, self.analyzer.gold_standard_map)
        self.assertIn(3, self.analyzer.gold_standard_map)

    def test_outcome_analysis(self):
        """Test individual outcome analysis"""
        # Create sample results
        sample_results = [
            (1, self._create_sample_metrics(2, 3, 50), self._create_sample_classification(TriageLevel.HOME_CARE, 0.8)),
            (2, self._create_sample_metrics(3, 5, 75), self._create_sample_classification(TriageLevel.CLINICIAN, 0.7)),
            (3, self._create_sample_metrics(4, 2, 30), self._create_sample_classification(TriageLevel.EMERGENCY, 0.9)),
        ]

        outcomes = self.analyzer.analyze_outcomes(sample_results)

        self.assertEqual(len(outcomes), 3)
        # Case 1: Home care prediction matches gold standard
        self.assertTrue(outcomes[0].is_correct)
        # Case 3: Emergency prediction matches gold standard
        self.assertTrue(outcomes[2].is_correct)

    def test_cohort_metrics_calculation(self):
        """Test cohort metrics calculation"""
        # Create sample outcomes
        outcomes = [
            self._create_sample_outcome(1, TriageLevel.HOME_CARE, TriageLevel.HOME_CARE, True),
            self._create_sample_outcome(2, TriageLevel.CLINICIAN, TriageLevel.CLINICIAN, True),
            self._create_sample_outcome(3, TriageLevel.EMERGENCY, TriageLevel.HOME_CARE, False, is_under_triage=True),
        ]

        metrics = self.analyzer.calculate_cohort_metrics(outcomes, "Test Cohort")

        self.assertEqual(metrics.total_cases, 3)
        self.assertAlmostEqual(metrics.overall_accuracy, 66.67, places=1)  # 2/3 correct
        self.assertAlmostEqual(metrics.under_triage_rate, 33.33, places=1)  # 1/3 under-triage

    def test_confusion_matrix_generation(self):
        """Test confusion matrix generation"""
        outcomes = [
            self._create_sample_outcome(1, TriageLevel.EMERGENCY, TriageLevel.EMERGENCY, True),
            self._create_sample_outcome(2, TriageLevel.EMERGENCY, TriageLevel.CLINICIAN, False),
            self._create_sample_outcome(3, TriageLevel.CLINICIAN, TriageLevel.CLINICIAN, True),
        ]

        matrix = self.analyzer.generate_confusion_matrix(outcomes)

        self.assertEqual(matrix.shape, (3, 3))
        self.assertEqual(matrix.loc["Emergency", "Emergency"], 1)
        self.assertEqual(matrix.loc["Emergency", "Clinician"], 1)
        self.assertEqual(matrix.loc["Clinician", "Clinician"], 1)

    def _create_sample_metrics(self, turns: int, questions: int, words: int) -> ConversationMetrics:
        """Create sample conversation metrics for testing"""
        return ConversationMetrics(
            final_recommendation="Emergency",
            response_turns=turns,
            question_count=questions,
            word_count=words,
            readability_score=8.0,
            transcript_text="Sample transcript",
            patient_turns=turns,
            conversation_length=turns * 2,
            avg_response_length=words / turns if turns > 0 else 0,
            question_density=questions / turns if turns > 0 else 0,
            critical_questions=1
        )

    def _create_sample_classification(self, level: TriageLevel, confidence: float) -> ClassificationResult:
        """Create sample classification result for testing"""
        return ClassificationResult(
            classified_level=level,
            confidence_score=confidence,
            evidence="test evidence",
            original_text="test recommendation",
            reasoning="test reasoning"
        )

    def _create_sample_outcome(self, case_id: int, gold: TriageLevel, predicted: TriageLevel,
                             is_correct: bool, is_under_triage: bool = False, is_over_triage: bool = False) -> TriageOutcome:
        """Create sample triage outcome for testing"""
        return TriageOutcome(
            case_id=case_id,
            gold_standard=gold,
            predicted=predicted,
            is_correct=is_correct,
            is_under_triage=is_under_triage,
            is_over_triage=is_over_triage,
            confidence_score=0.8,
            response_turns=3,
            question_count=4,
            word_count=60,
            readability_score=8.0,
            critical_questions=1
        )


class TestIntegration(unittest.TestCase):
    """Integration tests for end-to-end workflow"""

    def setUp(self):
        """Set up integration test fixtures"""
        self.processor = TranscriptProcessor()
        self.classifier = RecommendationClassifier()

        # Create sample TriageBench cases file
        self.temp_csv = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.csv')
        sample_cases = [
            {"case_id": 1, "gold_standard": "Home care", "initial_message": "Stuffy nose", "clinical_facts": "Minor cold symptoms"},
            {"case_id": 2, "gold_standard": "911", "initial_message": "Chest pain", "clinical_facts": "Severe chest pain with radiation"}
        ]

        writer = csv.DictWriter(self.temp_csv, fieldnames=['case_id', 'gold_standard', 'initial_message', 'clinical_facts'])
        writer.writeheader()
        writer.writerows(sample_cases)
        self.temp_csv.close()

        self.analyzer = TriageAccuracyAnalyzer(self.temp_csv.name)

    def tearDown(self):
        """Clean up temporary files"""
        os.unlink(self.temp_csv.name)

    def test_end_to_end_workflow(self):
        """Test complete end-to-end analysis workflow"""
        # Sample transcript data
        transcripts = [
            (1, [
                {"turn": 1, "role": "user", "content": "My nose is stuffy", "timestamp": "2024-01-01T10:00:00Z"},
                {"turn": 2, "role": "assistant", "content": "Try rest and fluids at home", "timestamp": "2024-01-01T10:00:30Z"}
            ]),
            (2, [
                {"turn": 1, "role": "user", "content": "Severe chest pain", "timestamp": "2024-01-01T10:00:00Z"},
                {"turn": 2, "role": "assistant", "content": "Call 911 immediately", "timestamp": "2024-01-01T10:00:30Z"}
            ])
        ]

        # Step 1: Process transcripts
        processed_metrics = {}
        for case_id, transcript in transcripts:
            metrics = self.processor.process_transcript(transcript)
            processed_metrics[case_id] = metrics

        # Step 2: Classify recommendations
        classified_results = {}
        for case_id, metrics in processed_metrics.items():
            if metrics.final_recommendation:
                classification = self.classifier.classify_recommendation(metrics.final_recommendation)
                classified_results[case_id] = classification

        # Step 3: Analyze outcomes
        results = []
        for case_id in processed_metrics.keys():
            if case_id in classified_results:
                results.append((case_id, processed_metrics[case_id], classified_results[case_id]))

        outcomes = self.analyzer.analyze_outcomes(results)

        # Step 4: Calculate cohort metrics
        cohort_metrics = self.analyzer.calculate_cohort_metrics(outcomes, "Test Platform")

        # Validate results
        self.assertEqual(len(outcomes), 2)
        self.assertGreater(cohort_metrics.overall_accuracy, 0)
        self.assertEqual(cohort_metrics.total_cases, 2)

    def test_performance_report_generation(self):
        """Test performance report generation"""
        # Create sample cohort metrics
        sample_metrics = [
            self.analyzer.calculate_cohort_metrics([
                self._create_sample_outcome(1, TriageLevel.HOME_CARE, TriageLevel.HOME_CARE, True),
                self._create_sample_outcome(2, TriageLevel.EMERGENCY, TriageLevel.EMERGENCY, True),
            ], "Perfect Platform"),
            self.analyzer.calculate_cohort_metrics([
                self._create_sample_outcome(1, TriageLevel.HOME_CARE, TriageLevel.CLINICIAN, False),
                self._create_sample_outcome(2, TriageLevel.EMERGENCY, TriageLevel.HOME_CARE, False, is_under_triage=True),
            ], "Imperfect Platform")
        ]

        report = self.analyzer.generate_performance_report(sample_metrics)

        self.assertIn("TriageBench Analysis Performance Report", report)
        self.assertIn("Platform-Level Performance Metrics", report)
        self.assertIn("Perfect Platform", report)
        self.assertIn("Imperfect Platform", report)

    def _create_sample_outcome(self, case_id: int, gold: TriageLevel, predicted: TriageLevel,
                             is_correct: bool, is_under_triage: bool = False, is_over_triage: bool = False) -> TriageOutcome:
        """Create sample triage outcome for testing"""
        return TriageOutcome(
            case_id=case_id,
            gold_standard=gold,
            predicted=predicted,
            is_correct=is_correct,
            is_under_triage=is_under_triage,
            is_over_triage=is_over_triage,
            confidence_score=0.8,
            response_turns=3,
            question_count=4,
            word_count=60,
            readability_score=8.0,
            critical_questions=1
        )


def create_sample_data():
    """Create sample data files for manual testing and validation"""
    print("Creating sample test data files...")

    # Create sample transcript data
    sample_transcripts = {
        "case_1_home_care": [
            {"turn": 1, "role": "user", "content": "My nose is stuffy and I keep sneezing.", "timestamp": "2024-01-01T10:00:00Z"},
            {"turn": 2, "role": "assistant", "content": "How long have you been experiencing these symptoms? Any fever?", "timestamp": "2024-01-01T10:00:30Z"},
            {"turn": 3, "role": "user", "content": "Just since yesterday. No fever, just congestion.", "timestamp": "2024-01-01T10:01:00Z"},
            {"turn": 4, "role": "assistant", "content": "This sounds like a common cold. Rest at home, drink plenty of fluids, and monitor your symptoms. If you develop fever or symptoms worsen, consider seeing a doctor.", "timestamp": "2024-01-01T10:01:30Z"}
        ],
        "case_2_clinician": [
            {"turn": 1, "role": "user", "content": "My back has been hurting for a week.", "timestamp": "2024-01-01T10:00:00Z"},
            {"turn": 2, "role": "assistant", "content": "Can you describe the pain? Is it sharp or dull? Does it radiate to your legs?", "timestamp": "2024-01-01T10:00:30Z"},
            {"turn": 3, "role": "user", "content": "It's a dull ache that shoots down my right leg sometimes.", "timestamp": "2024-01-01T10:01:00Z"},
            {"turn": 4, "role": "assistant", "content": "Based on your symptoms of back pain with leg radiation, you should schedule an appointment with your doctor for proper evaluation. This could be a nerve-related issue that needs professional assessment.", "timestamp": "2024-01-01T10:01:30Z"}
        ],
        "case_3_emergency": [
            {"turn": 1, "role": "user", "content": "I have severe chest pain and can't breathe well.", "timestamp": "2024-01-01T10:00:00Z"},
            {"turn": 2, "role": "assistant", "content": "How long has this been going on? Are you experiencing nausea or sweating?", "timestamp": "2024-01-01T10:00:30Z"},
            {"turn": 3, "role": "user", "content": "Started an hour ago. Yes, I'm sweating and feel nauseous.", "timestamp": "2024-01-01T10:01:00Z"},
            {"turn": 4, "role": "assistant", "content": "Your symptoms are concerning for a possible heart attack. Call 911 immediately or have someone drive you to the emergency room right now. Do not drive yourself.", "timestamp": "2024-01-01T10:01:30Z"}
        ]
    }

    # Save sample data
    sample_dir = Path("sample_data")
    sample_dir.mkdir(exist_ok=True)

    with open(sample_dir / "sample_transcripts.json", 'w') as f:
        json.dump(sample_transcripts, f, indent=2)

    print(f"Sample data created in {sample_dir}/")
    print("Files created:")
    print("- sample_transcripts.json: Sample conversation transcripts")
    print("\nUse this data to manually test the analysis scripts.")


def run_validation_tests():
    """Run comprehensive validation tests against TriageBench methodology"""
    print("Running TriageBench Analysis Validation Tests")
    print("=" * 50)

    # Create test suite
    test_suite = unittest.TestSuite()

    # Add test cases
    test_suite.addTest(unittest.makeSuite(TestTranscriptProcessor))
    test_suite.addTest(unittest.makeSuite(TestRecommendationClassifier))
    test_suite.addTest(unittest.makeSuite(TestTriageAccuracyAnalyzer))
    test_suite.addTest(unittest.makeSuite(TestIntegration))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)

    # Print summary
    print("\n" + "=" * 50)
    print("Test Results Summary:")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")

    if result.failures:
        print("\nFailures:")
        for test, traceback in result.failures:
            print(f"- {test}: {traceback}")

    if result.errors:
        print("\nErrors:")
        for test, traceback in result.errors:
            print(f"- {test}: {traceback}")

    success = len(result.failures) == 0 and len(result.errors) == 0
    print(f"\nOverall result: {'PASS' if success else 'FAIL'}")

    return success


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="TriageBench Analysis Test Suite")
    parser.add_argument("--create-samples", action="store_true", help="Create sample data files")
    parser.add_argument("--run-tests", action="store_true", help="Run validation tests")

    args = parser.parse_args()

    if args.create_samples:
        create_sample_data()

    if args.run_tests or (not args.create_samples):
        run_validation_tests()
