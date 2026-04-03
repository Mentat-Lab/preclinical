"""
TriageBench Analysis Package

Comprehensive analysis scripts for healthcare AI triage performance evaluation
following the TriageBench V4 paper methodology.

Modules:
- transcript_processor: Extract metrics from conversation transcripts
- recommendation_classifier: Map platform outputs to 3-tier taxonomy
- triage_accuracy_analyzer: Calculate primary/secondary outcomes
- test_analysis_suite: Comprehensive testing framework

Based on: TriageBench V4 paper methodology
Author: Preclinical Analysis Scripts
"""

from .transcript_processor import TranscriptProcessor, ConversationMetrics
from .recommendation_classifier import RecommendationClassifier, TriageLevel, ClassificationResult
from .triage_accuracy_analyzer import TriageAccuracyAnalyzer, TriageOutcome, CohortMetrics
from .test_analysis_suite import run_validation_tests

__version__ = "1.0.0"
__all__ = [
    "TranscriptProcessor",
    "ConversationMetrics",
    "RecommendationClassifier",
    "TriageLevel",
    "ClassificationResult",
    "TriageAccuracyAnalyzer",
    "TriageOutcome",
    "CohortMetrics",
    "run_validation_tests"
]
