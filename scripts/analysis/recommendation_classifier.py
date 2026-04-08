#!/usr/bin/env python3
"""
TriageBench Recommendation Classifier

Maps various healthcare AI platform outputs to the standardized 3-tier taxonomy
used in TriageBench analysis: Emergency care, Clinician evaluation, Home care.

Based on: TriageBench V4 paper methodology
Author: Preclinical Analysis Scripts
"""

import re
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass
from enum import Enum


class TriageLevel(Enum):
    """Standardized 3-tier triage taxonomy"""
    EMERGENCY = "Emergency care"
    CLINICIAN = "Clinician evaluation"
    HOME_CARE = "Home care"


@dataclass
class ClassificationResult:
    """Result of triage recommendation classification"""
    classified_level: TriageLevel
    confidence_score: float  # 0.0 to 1.0
    evidence: str           # Text that supported the classification
    original_text: str      # Original recommendation text
    reasoning: str          # Explanation of classification logic


class RecommendationClassifier:
    """
    Classify healthcare AI recommendations into standardized 3-tier taxonomy.

    Handles various formats from different platforms and providers:
    - Direct recommendations (e.g., "Go to emergency room")
    - Structured responses (e.g., JSON with recommendation field)
    - Natural language advice with embedded recommendations
    """

    def __init__(self):
        # Emergency care patterns (highest priority - seek immediate emergency care)
        self.emergency_patterns = {
            'high_confidence': [
                r'\b(call 911|dial 911|emergency services)\b',
                r'\b(go to.*emergency.*room|visit.*emergency.*room|emergency room immediately)\b',
                r'\b(call.*ambulance|request.*ambulance)\b',
                r'\b(life.threatening|life threatening)\b',
                r'\b(immediate.*emergency|emergency.*immediately)\b',
                r'\b(urgent.*emergency|emergency.*urgent)\b',
                r'\b(cannot wait|can\'t wait|must not wait)\b'
            ],
            'medium_confidence': [
                r'\b(emergency|emergent|urgent.*immediate)\b',
                r'\b(hospital.*now|hospital.*immediately)\b',
                r'\b(seek.*immediate.*medical)\b',
                r'\b(serious.*condition|critical.*condition)\b',
                r'\b(potentially.*dangerous|potentially.*serious)\b',
                r'\b(chest pain.*emergency|heart attack)\b',
                r'\b(stroke.*emergency|signs.*stroke)\b',
                r'\b(severe.*bleeding|massive.*bleeding)\b',
                r'\b(difficulty.*breathing.*emergency)\b'
            ]
        }

        # Clinician evaluation patterns (professional medical evaluation needed)
        self.clinician_patterns = {
            'high_confidence': [
                r'\b(see.*doctor|consult.*doctor|visit.*doctor)\b',
                r'\b(medical.*evaluation|professional.*evaluation)\b',
                r'\b(healthcare.*provider|medical.*provider)\b',
                r'\b(schedule.*appointment|make.*appointment)\b',
                r'\b(urgent.*care|walk.in.*clinic)\b',
                r'\b(primary.*care|family.*doctor)\b',
                r'\b(medical.*attention|professional.*assessment)\b'
            ],
            'medium_confidence': [
                r'\b(doctor|physician|clinician)\b',
                r'\b(medical.*office|clinic)\b',
                r'\b(evaluated.*by|examined.*by)\b',
                r'\b(follow.*up|follow.up)\b',
                r'\b(specialist|consultation)\b',
                r'\b(prescription|medication.*evaluation)\b',
                r'\b(diagnosis|diagnostic)\b'
            ]
        }

        # Home care patterns (self-care without professional evaluation)
        self.home_care_patterns = {
            'high_confidence': [
                r'\b(self.care|home.*care|manage.*at.*home)\b',
                r'\b(rest.*at.*home|stay.*home)\b',
                r'\b(over.the.counter|otc.*medication)\b',
                r'\b(monitor.*at.*home|watch.*at.*home)\b',
                r'\b(no.*medical.*attention|no.*need.*doctor)\b',
                r'\b(continue.*home.*treatment)\b'
            ],
            'medium_confidence': [
                r'\b(rest|sleep|hydration)\b',
                r'\b(wait.*and.*see|monitor.*symptoms)\b',
                r'\b(if.*symptoms.*worsen|if.*worse)\b',
                r'\b(self.*treatment|home.*remedy)\b',
                r'\b(over.*counter|non.*prescription)\b',
                r'\b(mild.*symptoms|minor.*condition)\b'
            ]
        }

        # Compile all patterns for efficiency
        self._compile_patterns()

    def _compile_patterns(self):
        """Compile regex patterns for efficient matching."""
        self.compiled_emergency = {}
        self.compiled_clinician = {}
        self.compiled_home_care = {}

        for confidence, patterns in self.emergency_patterns.items():
            self.compiled_emergency[confidence] = [
                re.compile(pattern, re.IGNORECASE) for pattern in patterns
            ]

        for confidence, patterns in self.clinician_patterns.items():
            self.compiled_clinician[confidence] = [
                re.compile(pattern, re.IGNORECASE) for pattern in patterns
            ]

        for confidence, patterns in self.home_care_patterns.items():
            self.compiled_home_care[confidence] = [
                re.compile(pattern, re.IGNORECASE) for pattern in patterns
            ]

    def classify_recommendation(self,
                              recommendation_text: str,
                              context: Optional[Dict[str, Any]] = None) -> ClassificationResult:
        """
        Classify a triage recommendation into the 3-tier taxonomy.

        Args:
            recommendation_text: The recommendation text to classify
            context: Additional context (agent response, full transcript, etc.)

        Returns:
            ClassificationResult with classification and confidence
        """
        if not recommendation_text or not recommendation_text.strip():
            return self._create_default_result(recommendation_text, "Empty recommendation text")

        # Clean and normalize text
        text = recommendation_text.strip().lower()

        # Score each category
        emergency_score, emergency_evidence = self._score_category(text, self.compiled_emergency)
        clinician_score, clinician_evidence = self._score_category(text, self.compiled_clinician)
        home_care_score, home_care_evidence = self._score_category(text, self.compiled_home_care)

        # Determine best match with confidence
        scores = [
            (TriageLevel.EMERGENCY, emergency_score, emergency_evidence),
            (TriageLevel.CLINICIAN, clinician_score, clinician_evidence),
            (TriageLevel.HOME_CARE, home_care_score, home_care_evidence)
        ]

        # Sort by score (descending)
        scores.sort(key=lambda x: x[1], reverse=True)
        best_level, best_score, best_evidence = scores[0]

        # If no clear match, use heuristics
        if best_score == 0:
            return self._classify_with_heuristics(recommendation_text, context)

        # Normalize confidence score
        confidence = min(1.0, best_score / 2.0)  # Scale to 0-1 range

        reasoning = self._generate_reasoning(best_level, best_score, best_evidence, scores)

        return ClassificationResult(
            classified_level=best_level,
            confidence_score=confidence,
            evidence=best_evidence,
            original_text=recommendation_text,
            reasoning=reasoning
        )

    def _score_category(self, text: str, compiled_patterns: Dict[str, List[re.Pattern]]) -> Tuple[float, str]:
        """Score how well text matches patterns for a category."""
        total_score = 0.0
        evidence_parts = []

        for confidence_level, patterns in compiled_patterns.items():
            weight = 2.0 if confidence_level == 'high_confidence' else 1.0

            for pattern in patterns:
                matches = pattern.findall(text)
                if matches:
                    match_score = len(matches) * weight
                    total_score += match_score
                    # Extract actual matched text for evidence
                    for match in pattern.finditer(text):
                        evidence_parts.append(match.group())

        evidence = "; ".join(set(evidence_parts)) if evidence_parts else ""
        return total_score, evidence

    def _classify_with_heuristics(self,
                                 recommendation_text: str,
                                 context: Optional[Dict[str, Any]]) -> ClassificationResult:
        """
        Use heuristics when pattern matching fails.

        Fallback classification based on keywords and context.
        """
        text = recommendation_text.lower()

        # Emergency heuristics
        emergency_keywords = ['emergency', '911', 'hospital', 'ambulance', 'urgent', 'immediate']
        emergency_count = sum(1 for keyword in emergency_keywords if keyword in text)

        # Clinician heuristics
        clinician_keywords = ['doctor', 'physician', 'clinic', 'appointment', 'medical', 'evaluate']
        clinician_count = sum(1 for keyword in clinician_keywords if keyword in text)

        # Home care heuristics
        home_keywords = ['home', 'rest', 'monitor', 'watch', 'self', 'care']
        home_count = sum(1 for keyword in home_keywords if keyword in text)

        # Determine classification based on keyword counts
        if emergency_count >= 2:
            level = TriageLevel.EMERGENCY
            confidence = min(0.8, emergency_count * 0.2)
            evidence = f"Emergency keywords: {emergency_count}"
        elif clinician_count >= 2:
            level = TriageLevel.CLINICIAN
            confidence = min(0.8, clinician_count * 0.2)
            evidence = f"Clinician keywords: {clinician_count}"
        elif home_count >= 2:
            level = TriageLevel.HOME_CARE
            confidence = min(0.8, home_count * 0.2)
            evidence = f"Home care keywords: {home_count}"
        else:
            # Default to clinician evaluation for safety
            level = TriageLevel.CLINICIAN
            confidence = 0.3
            evidence = "Default classification - unclear recommendation"

        reasoning = f"Heuristic classification based on keyword analysis. {evidence}"

        return ClassificationResult(
            classified_level=level,
            confidence_score=confidence,
            evidence=evidence,
            original_text=recommendation_text,
            reasoning=reasoning
        )

    def _create_default_result(self, text: str, reason: str) -> ClassificationResult:
        """Create a default classification result."""
        return ClassificationResult(
            classified_level=TriageLevel.CLINICIAN,  # Safe default
            confidence_score=0.1,
            evidence="",
            original_text=text or "",
            reasoning=f"Default classification: {reason}"
        )

    def _generate_reasoning(self,
                          best_level: TriageLevel,
                          best_score: float,
                          best_evidence: str,
                          all_scores: List[Tuple[TriageLevel, float, str]]) -> str:
        """Generate human-readable reasoning for classification."""
        reasoning_parts = [
            f"Classified as {best_level.value} with score {best_score:.1f}",
        ]

        if best_evidence:
            reasoning_parts.append(f"Key evidence: {best_evidence}")

        # Show comparison with other categories
        other_scores = [(level, score) for level, score, _ in all_scores[1:] if score > 0]
        if other_scores:
            other_info = [f"{level.value} ({score:.1f})" for level, score in other_scores]
            reasoning_parts.append(f"Other matches: {', '.join(other_info)}")

        return ". ".join(reasoning_parts)

    def classify_batch(self,
                      recommendations: List[Tuple[str, str]]) -> Dict[str, ClassificationResult]:
        """
        Classify multiple recommendations in batch.

        Args:
            recommendations: List of (scenario_run_id, recommendation_text) tuples

        Returns:
            Dictionary mapping scenario_run_id to ClassificationResult
        """
        results = {}

        for scenario_run_id, recommendation_text in recommendations:
            try:
                result = self.classify_recommendation(recommendation_text)
                results[scenario_run_id] = result
            except Exception as e:
                print(f"Error classifying recommendation {scenario_run_id}: {e}")
                results[scenario_run_id] = self._create_default_result(
                    recommendation_text, f"Classification error: {e}"
                )

        return results

    def validate_classification(self,
                              classification: ClassificationResult,
                              gold_standard: str) -> Dict[str, Any]:
        """
        Validate classification against gold standard from TriageBench cases.

        Args:
            classification: Classification result
            gold_standard: Gold standard from TriageBench cases

        Returns:
            Validation metrics dictionary
        """
        # Normalize gold standard text
        gold_standard_normalized = gold_standard.strip()

        # Map gold standard to TriageLevel
        gold_level = None
        if "Emergency" in gold_standard_normalized or "911" in gold_standard_normalized:
            gold_level = TriageLevel.EMERGENCY
        elif "Clinician" in gold_standard_normalized:
            gold_level = TriageLevel.CLINICIAN
        elif "Home care" in gold_standard_normalized:
            gold_level = TriageLevel.HOME_CARE

        is_correct = (classification.classified_level == gold_level) if gold_level else False

        # Determine triage safety
        is_under_triage = False
        is_over_triage = False

        if gold_level and classification.classified_level != gold_level:
            if gold_level == TriageLevel.EMERGENCY:
                is_under_triage = True  # Dangerous under-triage
            elif classification.classified_level == TriageLevel.EMERGENCY:
                is_over_triage = True   # Over-triage (less dangerous)

        return {
            'is_correct': is_correct,
            'is_under_triage': is_under_triage,
            'is_over_triage': is_over_triage,
            'gold_standard': gold_standard_normalized,
            'predicted': classification.classified_level.value,
            'confidence': classification.confidence_score
        }


def main():
    """Example usage and testing"""
    classifier = RecommendationClassifier()

    # Test cases
    test_cases = [
        "You need to call 911 immediately and go to the emergency room.",
        "I recommend seeing your doctor within the next few days.",
        "This seems minor. Rest at home and monitor your symptoms.",
        "Schedule an urgent care appointment for evaluation.",
        "Based on your symptoms, you should go to the hospital right away.",
        "Try some over-the-counter medication and rest."
    ]

    print("Recommendation Classification Examples:")
    print("=" * 50)

    for i, text in enumerate(test_cases, 1):
        result = classifier.classify_recommendation(text)
        print(f"\nTest {i}: {text}")
        print(f"Classification: {result.classified_level.value}")
        print(f"Confidence: {result.confidence_score:.2f}")
        print(f"Evidence: {result.evidence}")
        print(f"Reasoning: {result.reasoning}")


if __name__ == "__main__":
    main()
