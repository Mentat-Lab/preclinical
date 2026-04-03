#!/usr/bin/env python3
"""
TriageBench Transcript Processor

Processes conversation transcripts from Preclinical platform to extract key metrics
for TriageBench analysis methodology including turn counts, question analysis,
word counts, and readability scores.

Based on: TriageBench V4 paper methodology
Author: Preclinical Analysis Scripts
"""

import re
import json
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import textstat


class Role(Enum):
    """Conversation roles in transcript"""
    AGENT = "assistant"
    PATIENT = "user"
    SYSTEM = "system"


@dataclass
class TranscriptEntry:
    """Single transcript entry from Preclinical platform"""
    turn: int
    role: str
    content: str
    timestamp: str


@dataclass
class ConversationMetrics:
    """Extracted conversation metrics following TriageBench methodology"""
    final_recommendation: Optional[str]  # Emergency care | Clinician evaluation | Home care
    response_turns: int                  # Number of agent response turns
    question_count: int                  # Discrete questions asked by agent
    word_count: int                     # Total agent-generated words
    readability_score: float            # Flesch-Kincaid grade level
    transcript_text: str                # Full conversation text
    patient_turns: int                  # Number of patient turns
    conversation_length: int            # Total turns in conversation

    # Additional analysis metrics
    avg_response_length: float          # Average words per agent response
    question_density: float             # Questions per agent turn
    critical_questions: int             # Number of critical/red-flag questions


class TranscriptProcessor:
    """
    Process conversation transcripts to extract TriageBench analysis metrics.

    Handles the current Preclinical transcript format:
    [{"turn": 1, "role": "user", "content": "...", "timestamp": "..."}]
    """

    def __init__(self):
        # Question detection patterns
        self.question_patterns = [
            r'\?',                              # Direct question marks
            r'\b(what|when|where|why|how|which|who)\b.*\?',  # Wh-questions
            r'\b(do|did|does|can|could|would|should|will|is|are|have|has)\s+you\b',  # Yes/no questions
            r'\b(tell me|describe|explain)\b',   # Imperative questions
            r'\b(any|have you|are you)\b.*\?',  # Common question patterns
        ]

        # Compile patterns for efficiency
        self.compiled_patterns = [re.compile(pattern, re.IGNORECASE) for pattern in self.question_patterns]

        # Critical/red-flag question patterns
        self.critical_patterns = [
            r'\b(chest pain|difficulty breathing|severe pain|bleeding|unconscious|allergic reaction)\b',
            r'\b(emergency|911|hospital|ambulance|urgent)\b',
            r'\b(fever|temperature|blood pressure|heart rate)\b',
            r'\b(medication|allergy|medical history|chronic condition)\b',
        ]

        self.compiled_critical = [re.compile(pattern, re.IGNORECASE) for pattern in self.critical_patterns]

        # Triage recommendation patterns
        self.triage_patterns = {
            'Emergency': [
                r'\b(emergency|911|hospital|er|emergency room|ambulance)\b',
                r'\b(call 911|go to emergency|seek immediate)\b',
                r'\b(urgent medical attention|emergency care)\b'
            ],
            'Clinician': [
                r'\b(see.*doctor|consult.*physician|medical evaluation)\b',
                r'\b(urgent care|clinic|healthcare provider)\b',
                r'\b(medical attention|professional evaluation)\b'
            ],
            'Home care': [
                r'\b(home care|self.care|rest|over.the.counter)\b',
                r'\b(monitor|watch|observe|follow up if)\b',
                r'\b(no.*medical attention|manage at home)\b'
            ]
        }

    def process_transcript(self, transcript_data: List[Dict[str, Any]]) -> ConversationMetrics:
        """
        Process a transcript and extract all relevant metrics.

        Args:
            transcript_data: List of transcript entries in Preclinical format

        Returns:
            ConversationMetrics with all extracted data
        """
        # Parse transcript entries
        entries = [TranscriptEntry(**entry) for entry in transcript_data]

        # Separate agent and patient messages
        agent_messages = [entry for entry in entries if entry.role == Role.AGENT.value]
        patient_messages = [entry for entry in entries if entry.role == Role.PATIENT.value]

        # Extract basic counts
        response_turns = len(agent_messages)
        patient_turns = len(patient_messages)
        conversation_length = len(entries)

        # Analyze agent messages for content metrics
        agent_text = ' '.join([msg.content for msg in agent_messages])
        word_count = len(agent_text.split())

        # Count questions in agent messages
        question_count = self._count_questions(agent_messages)
        critical_questions = self._count_critical_questions(agent_messages)

        # Calculate readability (Flesch-Kincaid grade level)
        readability_score = textstat.flesch_kincaid(agent_text) if agent_text.strip() else 0.0

        # Extract final triage recommendation
        final_recommendation = self._extract_final_recommendation(entries)

        # Generate full transcript text for reference
        transcript_text = self._format_full_transcript(entries)

        # Calculate derived metrics
        avg_response_length = word_count / response_turns if response_turns > 0 else 0.0
        question_density = question_count / response_turns if response_turns > 0 else 0.0

        return ConversationMetrics(
            final_recommendation=final_recommendation,
            response_turns=response_turns,
            question_count=question_count,
            word_count=word_count,
            readability_score=readability_score,
            transcript_text=transcript_text,
            patient_turns=patient_turns,
            conversation_length=conversation_length,
            avg_response_length=avg_response_length,
            question_density=question_density,
            critical_questions=critical_questions
        )

    def _count_questions(self, agent_messages: List[TranscriptEntry]) -> int:
        """Count discrete questions asked by the agent."""
        total_questions = 0

        for message in agent_messages:
            content = message.content.strip()

            # Count questions using compiled patterns
            for pattern in self.compiled_patterns:
                matches = pattern.findall(content)
                total_questions += len(matches)

        return total_questions

    def _count_critical_questions(self, agent_messages: List[TranscriptEntry]) -> int:
        """Count critical/red-flag questions asked by the agent."""
        critical_count = 0

        for message in agent_messages:
            content = message.content.strip()

            # Check for critical question patterns
            for pattern in self.compiled_critical:
                if pattern.search(content):
                    critical_count += 1
                    break  # Only count once per message

        return critical_count

    def _extract_final_recommendation(self, entries: List[TranscriptEntry]) -> Optional[str]:
        """
        Extract the final triage recommendation from the conversation.

        Looks for triage recommendations in the last few agent messages,
        as the final recommendation is typically given at the end.
        """
        # Look at the last 3 agent messages for final recommendation
        agent_messages = [entry for entry in entries if entry.role == Role.AGENT.value]

        if not agent_messages:
            return None

        # Check last few messages in reverse order
        last_messages = agent_messages[-3:] if len(agent_messages) >= 3 else agent_messages

        for message in reversed(last_messages):
            content = message.content.lower()

            # Check each triage category
            for category, patterns in self.triage_patterns.items():
                for pattern in patterns:
                    if re.search(pattern, content, re.IGNORECASE):
                        return category

        return None

    def _format_full_transcript(self, entries: List[TranscriptEntry]) -> str:
        """Format the full conversation transcript for reference."""
        formatted_lines = []

        for entry in entries:
            role_label = "Agent" if entry.role == Role.AGENT.value else "Patient"
            formatted_lines.append(f"Turn {entry.turn} - {role_label}: {entry.content}")

        return '\n'.join(formatted_lines)

    def process_batch(self, transcripts: List[Tuple[str, List[Dict[str, Any]]]]) -> Dict[str, ConversationMetrics]:
        """
        Process multiple transcripts in batch.

        Args:
            transcripts: List of (scenario_run_id, transcript_data) tuples

        Returns:
            Dictionary mapping scenario_run_id to ConversationMetrics
        """
        results = {}

        for scenario_run_id, transcript_data in transcripts:
            try:
                metrics = self.process_transcript(transcript_data)
                results[scenario_run_id] = metrics
            except Exception as e:
                print(f"Error processing transcript {scenario_run_id}: {e}")
                # Create empty metrics for failed processing
                results[scenario_run_id] = ConversationMetrics(
                    final_recommendation=None,
                    response_turns=0,
                    question_count=0,
                    word_count=0,
                    readability_score=0.0,
                    transcript_text="",
                    patient_turns=0,
                    conversation_length=0,
                    avg_response_length=0.0,
                    question_density=0.0,
                    critical_questions=0
                )

        return results


def main():
    """Example usage and testing"""
    # Sample transcript data in Preclinical format
    sample_transcript = [
        {
            "turn": 1,
            "role": "user",
            "content": "My chest hurts and I feel short of breath.",
            "timestamp": "2024-01-01T10:00:00Z"
        },
        {
            "turn": 2,
            "role": "assistant",
            "content": "I'm concerned about your chest pain and shortness of breath. Can you describe the pain? When did it start? Are you experiencing any nausea or sweating?",
            "timestamp": "2024-01-01T10:00:30Z"
        },
        {
            "turn": 3,
            "role": "user",
            "content": "It started about an hour ago. The pain is crushing and I'm sweating.",
            "timestamp": "2024-01-01T10:01:00Z"
        },
        {
            "turn": 4,
            "role": "assistant",
            "content": "Based on your symptoms of crushing chest pain with sweating and shortness of breath, this sounds like it could be a heart attack. You need to call 911 immediately or go to the emergency room right now. Do not drive yourself.",
            "timestamp": "2024-01-01T10:01:30Z"
        }
    ]

    processor = TranscriptProcessor()
    metrics = processor.process_transcript(sample_transcript)

    print("Sample Transcript Analysis:")
    print(f"Final Recommendation: {metrics.final_recommendation}")
    print(f"Response Turns: {metrics.response_turns}")
    print(f"Questions Asked: {metrics.question_count}")
    print(f"Word Count: {metrics.word_count}")
    print(f"Readability Score: {metrics.readability_score:.2f}")
    print(f"Question Density: {metrics.question_density:.2f}")
    print(f"Critical Questions: {metrics.critical_questions}")


if __name__ == "__main__":
    main()
