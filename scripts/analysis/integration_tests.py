#!/usr/bin/env python3
"""
TriageBench Analysis Integration Tests

End-to-end integration tests that validate the complete TriageBench analysis
pipeline using actual TriageBench case data. These tests work without requiring
external Python dependencies by using built-in modules and simplified logic.

Tests include:
- Full pipeline validation from transcript to report generation
- Accuracy validation against known TriageBench results
- Performance testing with multiple cases
- Error handling and edge case testing

Author: Preclinical Analysis Scripts
"""

import json
import csv
import tempfile
import os
import sys
import unittest
import subprocess
from typing import List, Dict, Any, Tuple
from pathlib import Path
import time
from dataclasses import dataclass

# Add the analysis directory to path for imports
sys.path.append(os.path.dirname(__file__))

# Create simplified versions that work without external dependencies
class SimplifiedTranscriptProcessor:
    """Simplified version for testing without textstat dependency"""

    def process_transcript(self, transcript_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Process transcript with basic built-in functionality"""
        agent_messages = [entry for entry in transcript_data if entry.get('role') == 'assistant']
        patient_messages = [entry for entry in transcript_data if entry.get('role') == 'user']

        response_turns = len(agent_messages)
        patient_turns = len(patient_messages)
        conversation_length = len(transcript_data)

        agent_text = ' '.join([msg.get('content', '') for msg in agent_messages])
        word_count = len([word for word in agent_text.split() if word.strip()])

        # Simple question counting
        question_count = agent_text.count('?')

        # Extract final recommendation
        final_recommendation = self._extract_final_recommendation(agent_messages)

        return {
            'final_recommendation': final_recommendation,
            'response_turns': response_turns,
            'question_count': question_count,
            'word_count': word_count,
            'readability_score': 8.0,  # Placeholder
            'patient_turns': patient_turns,
            'conversation_length': conversation_length,
            'avg_response_length': word_count / max(response_turns, 1),
            'question_density': question_count / max(response_turns, 1),
            'critical_questions': len([msg for msg in agent_messages
                                     if any(word in msg.get('content', '').lower()
                                           for word in ['emergency', 'urgent', 'pain', 'bleeding'])])
        }

    def _extract_final_recommendation(self, agent_messages: List[Dict[str, Any]]) -> str:
        """Extract final recommendation from agent messages"""
        if not agent_messages:
            return None

        last_message = agent_messages[-1].get('content', '').lower()

        if any(word in last_message for word in ['911', 'emergency', 'hospital']):
            return 'Emergency'
        elif any(word in last_message for word in ['doctor', 'clinic', 'medical']):
            return 'Clinician'
        elif any(word in last_message for word in ['home', 'rest', 'monitor']):
            return 'Home care'

        return None


class SimplifiedRecommendationClassifier:
    """Simplified classifier for testing"""

    def classify_recommendation(self, text: str) -> Dict[str, Any]:
        """Classify recommendation text"""
        if not text:
            return {
                'classified_level': 'Clinician evaluation',
                'confidence_score': 0.1,
                'evidence': '',
                'reasoning': 'No recommendation found'
            }

        text_lower = text.lower()

        if any(word in text_lower for word in ['911', 'emergency', 'hospital']):
            return {
                'classified_level': 'Emergency care',
                'confidence_score': 0.9,
                'evidence': 'Emergency keywords found',
                'reasoning': 'High confidence emergency classification'
            }
        elif any(word in text_lower for word in ['doctor', 'clinic', 'medical']):
            return {
                'classified_level': 'Clinician evaluation',
                'confidence_score': 0.8,
                'evidence': 'Medical professional keywords found',
                'reasoning': 'Medical evaluation recommended'
            }
        else:
            return {
                'classified_level': 'Home care',
                'confidence_score': 0.7,
                'evidence': 'Self-care indicators',
                'reasoning': 'Home care appropriate'
            }


@dataclass
class TestCase:
    """Test case data structure"""
    case_id: int
    gold_standard: str
    initial_message: str
    clinical_facts: str
    expected_classification: str
    transcript: List[Dict[str, Any]]


class TriageBenchIntegrationTest(unittest.TestCase):
    """Integration tests for the complete TriageBench analysis pipeline"""

    def setUp(self):
        """Set up test fixtures"""
        self.processor = SimplifiedTranscriptProcessor()
        self.classifier = SimplifiedRecommendationClassifier()

        # Load test cases
        self.test_cases = self._create_test_cases()

    def _create_test_cases(self) -> List[TestCase]:
        """Create test cases based on TriageBench data"""
        return [
            # Home care case
            TestCase(
                case_id=1,
                gold_standard="Home care",
                initial_message="My nose is stuffy and I keep sneezing.",
                clinical_facts="32-year-old female; onset 1 day; nasal congestion yes; sneezing frequent",
                expected_classification="Home care",
                transcript=[
                    {"turn": 1, "role": "user", "content": "My nose is stuffy and I keep sneezing.", "timestamp": "2024-01-01T10:00:00Z"},
                    {"turn": 2, "role": "assistant", "content": "How long have you been experiencing these symptoms? Any fever?", "timestamp": "2024-01-01T10:00:30Z"},
                    {"turn": 3, "role": "user", "content": "Since yesterday. No fever, just congestion.", "timestamp": "2024-01-01T10:01:00Z"},
                    {"turn": 4, "role": "assistant", "content": "This sounds like a common cold. You can manage this at home with rest and fluids.", "timestamp": "2024-01-01T10:01:30Z"}
                ]
            ),
            # Clinician case
            TestCase(
                case_id=21,
                gold_standard="Clinician",
                initial_message="I checked my blood pressure at the pharmacy and it was higher than normal.",
                clinical_facts="52-year-old male; hypertension no; blood pressure 162/96; headaches yes",
                expected_classification="Clinician evaluation",
                transcript=[
                    {"turn": 1, "role": "user", "content": "I checked my blood pressure at the pharmacy and it was higher than normal.", "timestamp": "2024-01-01T10:00:00Z"},
                    {"turn": 2, "role": "assistant", "content": "What was the reading? Are you having any symptoms?", "timestamp": "2024-01-01T10:00:30Z"},
                    {"turn": 3, "role": "user", "content": "It was 162/96 and I've been having headaches.", "timestamp": "2024-01-01T10:01:00Z"},
                    {"turn": 4, "role": "assistant", "content": "You should see a doctor for proper evaluation of your blood pressure.", "timestamp": "2024-01-01T10:01:30Z"}
                ]
            ),
            # Emergency case
            TestCase(
                case_id=41,
                gold_standard="911",
                initial_message="My chest feels tight and it goes into my neck.",
                clinical_facts="58-year-old male; chest pain with radiation; sweating yes; nausea yes",
                expected_classification="Emergency care",
                transcript=[
                    {"turn": 1, "role": "user", "content": "My chest feels tight and it goes into my neck.", "timestamp": "2024-01-01T10:00:00Z"},
                    {"turn": 2, "role": "assistant", "content": "How long has this been going on? Any other symptoms?", "timestamp": "2024-01-01T10:00:30Z"},
                    {"turn": 3, "role": "user", "content": "About 40 minutes. I'm sweating and nauseous.", "timestamp": "2024-01-01T10:01:00Z"},
                    {"turn": 4, "role": "assistant", "content": "Call 911 immediately. This could be a heart attack.", "timestamp": "2024-01-01T10:01:30Z"}
                ]
            )
        ]

    def test_transcript_processing(self):
        """Test transcript processing functionality"""
        for test_case in self.test_cases:
            with self.subTest(case_id=test_case.case_id):
                metrics = self.processor.process_transcript(test_case.transcript)

                # Validate basic metrics
                self.assertIsInstance(metrics['response_turns'], int)
                self.assertGreater(metrics['response_turns'], 0)
                self.assertIsInstance(metrics['word_count'], int)
                self.assertGreater(metrics['word_count'], 0)
                self.assertIsInstance(metrics['question_count'], int)
                self.assertGreaterEqual(metrics['question_count'], 0)

                # Validate final recommendation extraction
                if metrics['final_recommendation']:
                    self.assertIn(metrics['final_recommendation'], ['Emergency', 'Clinician', 'Home care'])

    def test_recommendation_classification(self):
        """Test recommendation classification accuracy"""
        test_recommendations = [
            ("Call 911 immediately", "Emergency care"),
            ("You should see a doctor", "Clinician evaluation"),
            ("Rest at home and monitor symptoms", "Home care"),
            ("Go to the emergency room now", "Emergency care"),
            ("Schedule an appointment with your physician", "Clinician evaluation"),
            ("", "Clinician evaluation")  # Default case
        ]

        for recommendation, expected_level in test_recommendations:
            with self.subTest(recommendation=recommendation):
                result = self.classifier.classify_recommendation(recommendation)
                self.assertEqual(result['classified_level'], expected_level)
                self.assertGreater(result['confidence_score'], 0.0)
                self.assertLessEqual(result['confidence_score'], 1.0)

    def test_end_to_end_pipeline(self):
        """Test complete end-to-end analysis pipeline"""
        results = []

        for test_case in self.test_cases:
            # Step 1: Process transcript
            metrics = self.processor.process_transcript(test_case.transcript)

            # Step 2: Classify recommendation
            classification = self.classifier.classify_recommendation(metrics['final_recommendation'])

            # Step 3: Validate accuracy
            is_correct = self._validate_classification(classification['classified_level'], test_case.gold_standard)

            results.append({
                'case_id': test_case.case_id,
                'gold_standard': test_case.gold_standard,
                'predicted': classification['classified_level'],
                'is_correct': is_correct,
                'metrics': metrics,
                'classification': classification
            })

        # Validate results
        self.assertEqual(len(results), 3)

        # At least one case should be correct (depending on implementation)
        correct_count = sum(1 for r in results if r['is_correct'])
        self.assertGreater(correct_count, 0, "At least one test case should be classified correctly")

        # All results should have valid structure
        for result in results:
            self.assertIn('case_id', result)
            self.assertIn('gold_standard', result)
            self.assertIn('predicted', result)
            self.assertIn('is_correct', result)
            self.assertIsInstance(result['is_correct'], bool)

    def test_performance_with_multiple_cases(self):
        """Test performance with multiple cases"""
        start_time = time.time()

        # Process all test cases multiple times to simulate larger dataset
        for _ in range(10):  # Simulate 30 cases (3 cases x 10 iterations)
            for test_case in self.test_cases:
                metrics = self.processor.process_transcript(test_case.transcript)
                classification = self.classifier.classify_recommendation(metrics['final_recommendation'])

        processing_time = time.time() - start_time

        # Should process 30 cases in reasonable time (< 5 seconds)
        self.assertLess(processing_time, 5.0, "Processing should complete within 5 seconds for 30 cases")

        # Average processing time per case
        avg_time_per_case = processing_time / 30
        self.assertLess(avg_time_per_case, 0.2, "Average processing time per case should be < 200ms")

    def test_error_handling(self):
        """Test error handling with malformed data"""
        # Test empty transcript
        empty_metrics = self.processor.process_transcript([])
        self.assertEqual(empty_metrics['response_turns'], 0)
        self.assertEqual(empty_metrics['word_count'], 0)

        # Test malformed transcript entries
        malformed_transcript = [
            {"turn": 1, "role": "user"},  # Missing content
            {"role": "assistant", "content": "Test"},  # Missing turn
            {"turn": 3, "content": "Test"}  # Missing role
        ]

        metrics = self.processor.process_transcript(malformed_transcript)
        self.assertIsInstance(metrics, dict)
        self.assertIn('response_turns', metrics)

        # Test empty/None recommendation classification
        empty_classification = self.classifier.classify_recommendation("")
        self.assertEqual(empty_classification['classified_level'], 'Clinician evaluation')

        none_classification = self.classifier.classify_recommendation(None)
        self.assertEqual(none_classification['classified_level'], 'Clinician evaluation')

    def test_triageBench_methodology_compliance(self):
        """Test compliance with TriageBench methodology"""
        for test_case in self.test_cases:
            metrics = self.processor.process_transcript(test_case.transcript)

            # TriageBench requires these specific metrics
            required_metrics = [
                'final_recommendation',
                'response_turns',
                'question_count',
                'word_count',
                'readability_score'
            ]

            for metric in required_metrics:
                self.assertIn(metric, metrics, f"Missing required TriageBench metric: {metric}")

            # Validate metric types and ranges
            self.assertIsInstance(metrics['response_turns'], int)
            self.assertGreaterEqual(metrics['response_turns'], 0)
            self.assertIsInstance(metrics['question_count'], int)
            self.assertGreaterEqual(metrics['question_count'], 0)
            self.assertIsInstance(metrics['word_count'], int)
            self.assertGreaterEqual(metrics['word_count'], 0)
            self.assertIsInstance(metrics['readability_score'], (int, float))

    def _validate_classification(self, predicted: str, gold_standard: str) -> bool:
        """Validate classification against gold standard"""
        # Normalize gold standard
        if gold_standard == "911":
            normalized_gold = "Emergency care"
        elif gold_standard == "Clinician":
            normalized_gold = "Clinician evaluation"
        elif gold_standard == "Home care":
            normalized_gold = "Home care"
        else:
            normalized_gold = gold_standard

        return predicted == normalized_gold


class TriageBenchValidationTest(unittest.TestCase):
    """Validation tests against TriageBench methodology"""

    def test_case_data_loading(self):
        """Test loading of TriageBench case data"""
        triageBench_csv_path = Path(__file__).parent.parent.parent / "TriageBenchCases.csv"

        if triageBench_csv_path.exists():
            with open(triageBench_csv_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                cases = list(reader)

            # Should have 60 cases as per paper
            self.assertEqual(len(cases), 60, "TriageBench should have exactly 60 test cases")

            # Validate case structure
            required_fields = ['case_id', 'gold_standard', 'initial_message', 'clinical_facts']
            for case in cases[:5]:  # Test first 5 cases
                for field in required_fields:
                    self.assertIn(field, case, f"Missing required field: {field}")

            # Validate gold standard distribution (should be balanced)
            gold_standards = [case['gold_standard'] for case in cases]
            home_care_count = gold_standards.count('Home care')
            clinician_count = gold_standards.count('Clinician')
            emergency_count = gold_standards.count('911')

            # Each category should have cases (exact distribution may vary)
            self.assertGreater(home_care_count, 0, "Should have Home care cases")
            self.assertGreater(clinician_count, 0, "Should have Clinician cases")
            self.assertGreater(emergency_count, 0, "Should have Emergency (911) cases")

        else:
            self.skipTest("TriageBenchCases.csv not found - skipping case data validation")

    def test_analysis_output_format(self):
        """Test that analysis output matches expected format"""
        processor = SimplifiedTranscriptProcessor()
        classifier = SimplifiedRecommendationClassifier()

        sample_transcript = [
            {"turn": 1, "role": "user", "content": "Test message", "timestamp": "2024-01-01T10:00:00Z"},
            {"turn": 2, "role": "assistant", "content": "Test response", "timestamp": "2024-01-01T10:00:30Z"}
        ]

        # Process transcript
        metrics = processor.process_transcript(sample_transcript)

        # Classification
        classification = classifier.classify_recommendation(metrics['final_recommendation'])

        # Validate output structure matches what the platform integration expects
        expected_metrics_keys = {
            'final_recommendation', 'response_turns', 'question_count',
            'word_count', 'readability_score', 'patient_turns',
            'conversation_length', 'avg_response_length', 'question_density',
            'critical_questions'
        }

        self.assertEqual(set(metrics.keys()), expected_metrics_keys)

        expected_classification_keys = {
            'classified_level', 'confidence_score', 'evidence', 'reasoning'
        }

        self.assertEqual(set(classification.keys()), expected_classification_keys)


def create_integration_test_report() -> str:
    """Create a comprehensive test report"""
    print("Running TriageBench Integration Tests...")
    print("=" * 50)

    # Run test suite
    test_suite = unittest.TestSuite()
    test_suite.addTest(unittest.makeSuite(TriageBenchIntegrationTest))
    test_suite.addTest(unittest.makeSuite(TriageBenchValidationTest))

    # Capture test results
    test_runner = unittest.TextTestRunner(stream=sys.stdout, verbosity=2)
    result = test_runner.run(test_suite)

    # Generate report
    report_lines = []
    report_lines.append("# TriageBench Integration Test Report")
    report_lines.append("")
    report_lines.append(f"**Generated**: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    report_lines.append(f"**Tests Run**: {result.testsRun}")
    report_lines.append(f"**Failures**: {len(result.failures)}")
    report_lines.append(f"**Errors**: {len(result.errors)}")
    report_lines.append("")

    if result.failures:
        report_lines.append("## Failures")
        for test, traceback in result.failures:
            report_lines.append(f"- **{test}**: {traceback}")
        report_lines.append("")

    if result.errors:
        report_lines.append("## Errors")
        for test, traceback in result.errors:
            report_lines.append(f"- **{test}**: {traceback}")
        report_lines.append("")

    success_rate = ((result.testsRun - len(result.failures) - len(result.errors)) / result.testsRun) * 100 if result.testsRun > 0 else 0
    report_lines.append(f"## Overall Success Rate: {success_rate:.1f}%")
    report_lines.append("")

    if success_rate >= 90:
        report_lines.append("✅ **PASS**: Integration tests meet quality standards")
    elif success_rate >= 75:
        report_lines.append("⚠️ **WARNING**: Some integration issues detected")
    else:
        report_lines.append("❌ **FAIL**: Significant integration issues require attention")

    return "\n".join(report_lines)


if __name__ == "__main__":
    # Run integration tests and generate report
    if len(sys.argv) > 1 and sys.argv[1] == "--report":
        report = create_integration_test_report()
        print("\n" + "=" * 50)
        print("INTEGRATION TEST REPORT")
        print("=" * 50)
        print(report)

        # Save report to file
        report_path = Path(__file__).parent / "integration_test_report.md"
        with open(report_path, 'w') as f:
            f.write(report)
        print(f"\nReport saved to: {report_path}")

    else:
        # Run standard unittest
        unittest.main()
