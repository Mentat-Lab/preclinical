"""
Pipecat Text Agent - Text-only mode for testing

Uses Daily app messages for input/output (no audio).
This agent uses daily-python SDK directly for simpler text-only operation.
"""

import asyncio
import os
import sys
from pathlib import Path

# Load environment from repo root
root_env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
if root_env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(root_env_path)

from openai import AsyncOpenAI
from daily import Daily, CallClient, EventHandler

AGENT_NAME = "preclinical-pipecat-text-agent"

SYSTEM_PROMPT = """# Healthcare Coordination Agent Prompt

## Identity & Purpose

You are Robin, a healthcare coordination voice assistant for Wellness Alliance Medical Group. Your primary purpose is to help patients schedule medical appointments, answer general health questions, provide pre-visit guidance, help with prescription refills, and coordinate care services while maintaining strict HIPAA compliance.

## Voice & Persona

### Personality
- Sound compassionate, patient, and reassuring
- Project a professional yet approachable demeanor
- Maintain a calm, clear tone even when discussing sensitive health matters
- Convey competence and healthcare knowledge without sounding clinical

### Speech Characteristics
- Speak in a warm, measured pace, especially when providing medical information
- Use natural contractions and conversational language to build rapport
- Include thoughtful transitions like "Let me check that for you" or "I understand this is important"
- Balance medical terminology with accessible explanations when necessary

## Conversation Flow

### Introduction & Authentication
Start with: "Thank you for calling Wellness Alliance Medical Group. This is Robin, your healthcare coordinator. This call is protected under HIPAA privacy regulations. How may I help you today?"

For authentication: "Before we discuss any personal health information, I'll need to verify your identity. Could you please provide your [specific verification information]?"

Privacy reminder: "Thank you for verifying your identity. I want to assure you that our conversation is confidential and protected by HIPAA privacy laws."

### Purpose Determination
1. Open with general inquiry: "How can I assist you with your healthcare needs today?"
2. Clarify specific need: "I understand you're calling about [specific purpose]. To help you best, could you provide a few more details about what you need?"
3. Set appropriate expectations: "I'll be happy to help you with that. Just so you know, I can [capabilities] but would need to connect you with [appropriate provider] for [limitations]."

## Response Guidelines

- Use clear, accessible language when discussing health information
- Avoid medical jargon when possible; when necessary, provide plain language explanations
- Maintain a calm, reassuring tone regardless of the health concern described
- Express appropriate empathy without overreacting to health concerns

## Scenario Handling

### For Urgent Medical Situations
1. Identify emergency situations immediately: "Based on what you're describing, this sounds like it requires immediate medical attention."
2. Provide clear guidance: "This is not something you should wait to address. You should [go to the emergency room/call 911] immediately."
3. Remain calm and directive: "The most important thing right now is for you to get immediate medical care."

### For Appointment Scheduling
1. Match provider to need: "Based on your situation, I recommend scheduling with [appropriate provider type]."
2. Provide options: "Dr. Smith has availability this Thursday at 10:00 AM or next Monday at 2:30 PM. Would either of those work for you?"

### For Prescription-Related Requests
1. Verify prescription details: "Let me confirm the prescription information. You're requesting a refill for [medication name] at [dosage], is that correct?"
2. Explain process: "I'll send this refill request to Dr. [Name] for review. Once approved, it will be sent to your pharmacy."

Remember that your ultimate goal is to connect patients with appropriate care while providing a compassionate, efficient experience. Always prioritize patient safety, maintain strict confidentiality, and help navigate the healthcare system with empathy and clarity."""


class TextAgentEventHandler(EventHandler):
    """Event handler for the text agent."""

    def __init__(self, agent: "TextAgent"):
        super().__init__()
        self.agent = agent

    def on_participant_joined(self, participant):
        """Handle participant joined event."""
        info = participant.get("info", {})
        user_name = info.get("userName", "")
        participant_id = info.get("participantId", "")

        print(f"[TextAgent] Participant joined: {user_name} ({participant_id})")

        # Check if this is not us (the agent)
        if user_name != AGENT_NAME and "agent" not in user_name.lower():
            if not self.agent._first_participant_joined:
                self.agent._first_participant_joined = True
                # Queue a greeting message
                self.agent._queue_message(
                    {"text": "Hello, I'm calling about a healthcare matter.", "_greeting": True},
                    "system"
                )

    def on_participant_left(self, participant, reason):
        """Handle participant left event."""
        info = participant.get("info", {})
        user_name = info.get("userName", "")
        print(f"[TextAgent] Participant left: {user_name} - {reason}")

        # Check if all non-agent participants have left
        if self.agent.call_client:
            participants = self.agent.call_client.participants()
            non_agent_count = sum(
                1 for pid, p in participants.items()
                if pid != "local" and "agent" not in p.get("info", {}).get("userName", "").lower()
            )
            if non_agent_count == 0 and self.agent._first_participant_joined:
                print("[TextAgent] All participants left, stopping...")
                self.agent._should_stop = True

    def on_app_message(self, message, sender):
        """Handle incoming app message."""
        # Ignore our own messages
        sender_name = sender if isinstance(sender, str) else str(sender)
        if sender_name == AGENT_NAME or sender_name == "local":
            return

        print(f"[TextAgent] Received from {sender}: {message}")
        self.agent._queue_message(message, sender)


class TextAgent:
    """Text-only agent that uses app messages for communication."""

    def __init__(self):
        self.call_client = None
        self.messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        self.openai = None
        self.model = None
        self._loop = None
        self._should_stop = False
        self._first_participant_joined = False
        self._pending_messages = asyncio.Queue()
        self._setup_openai()

    def _setup_openai(self):
        """Initialize OpenAI client."""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required")

        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

        self.openai = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
        )

        # Determine model name based on endpoint
        if "openai.com" in base_url.lower():
            self.model = "gpt-4o-mini"
        else:
            self.model = os.getenv("OPENAI_MODEL", "openai-main/gpt-4o-mini")

    async def get_response(self, user_message: str) -> str:
        """Get LLM response for user message."""
        self.messages.append({"role": "user", "content": user_message})

        response = await self.openai.chat.completions.create(
            model=self.model,
            messages=self.messages,
            max_tokens=500,
            temperature=0.7,
        )

        assistant_message = response.choices[0].message.content
        self.messages.append({"role": "assistant", "content": assistant_message})

        return assistant_message

    def _queue_message(self, message: dict, sender: str):
        """Queue a message for processing (thread-safe)."""
        if self._loop:
            self._loop.call_soon_threadsafe(
                self._pending_messages.put_nowait,
                (message, sender)
            )

    async def process_messages(self):
        """Process queued messages."""
        while not self._should_stop:
            try:
                # Wait for a message with timeout
                try:
                    message, sender = await asyncio.wait_for(
                        self._pending_messages.get(),
                        timeout=1.0
                    )
                except asyncio.TimeoutError:
                    continue

                # Extract text from message
                if isinstance(message, dict):
                    text = message.get("text", message.get("message", str(message)))
                else:
                    text = str(message)

                print(f"[TextAgent] Processing: {text[:50]}...")

                # Get LLM response
                response = await self.get_response(text)
                print(f"[TextAgent] Response: {response[:100]}...")

                # Send response as app message (None = broadcast to all)
                self.call_client.send_app_message(
                    {"text": response, "sender": AGENT_NAME}
                )

            except Exception as e:
                print(f"[TextAgent] Error processing message: {e}")
                import traceback
                traceback.print_exc()

    async def run(self, room_url: str, token: str = None):
        """Run the text agent in a Daily room."""
        self._loop = asyncio.get_running_loop()

        # Initialize Daily
        Daily.init()

        # Create event handler
        event_handler = TextAgentEventHandler(self)

        # Create call client with event handler
        self.call_client = CallClient(event_handler=event_handler)

        # Set user name
        self.call_client.set_user_name(AGENT_NAME)

        # Set up subscription profiles (no audio/video)
        self.call_client.update_subscription_profiles({
            "base": {
                "camera": "unsubscribed",
                "microphone": "unsubscribed",
            }
        })

        # Join the room
        print(f"[TextAgent] Joining room: {room_url}")
        join_complete = asyncio.Event()
        join_error = None

        def on_join_complete(result, error):
            nonlocal join_error
            join_error = error
            if error:
                print(f"[TextAgent] Join error: {error}")
            else:
                print(f"[TextAgent] Joined successfully")
            self._loop.call_soon_threadsafe(join_complete.set)

        self.call_client.join(
            room_url,
            token,
            client_settings={
                "inputs": {
                    "camera": False,
                    "microphone": False,
                },
            },
            completion=on_join_complete,
        )

        # Wait for join to complete
        await asyncio.wait_for(join_complete.wait(), timeout=10)
        if join_error:
            raise RuntimeError(f"Failed to join room: {join_error}")

        print("[TextAgent] Ready for messages")

        # Check existing participants
        participants = self.call_client.participants()
        for pid, pinfo in participants.items():
            if pid != "local":
                user_name = pinfo.get("info", {}).get("userName", "")
                if "agent" not in user_name.lower():
                    event_handler.on_participant_joined(pinfo)

        # Process messages until stopped
        await self.process_messages()

        # Leave the room
        print("[TextAgent] Leaving room...")
        self.call_client.leave()


async def run_agent(room_url: str, token: str = None):
    """Run the agent in a Daily room."""
    agent = TextAgent()
    await agent.run(room_url, token)


# Entry point
async def main(room_url: str, token: str = None):
    """Main entry point."""
    await run_agent(room_url, token)


if __name__ == "__main__":
    import asyncio

    # Check if room URL is provided via environment variable
    external_room_url = os.getenv("DAILY_ROOM_URL")
    external_room_token = os.getenv("DAILY_ROOM_TOKEN")

    if external_room_url:
        print(f"Joining room: {external_room_url}")
        asyncio.run(run_agent(external_room_url, external_room_token))
    elif len(sys.argv) > 1:
        room_url = sys.argv[1]
        token = sys.argv[2] if len(sys.argv) > 2 else None
        print(f"Joining room: {room_url}")
        asyncio.run(run_agent(room_url, token))
    else:
        print(f"Usage: python {sys.argv[0]} <room_url> [token]")
        print(f"Or: DAILY_ROOM_URL=<url> python {sys.argv[0]}")
        sys.exit(1)
