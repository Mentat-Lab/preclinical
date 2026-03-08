"""
Pipecat Text Agent Smoke Chat Test

Matches LiveKit's smoke_chat.js pattern:
1. Create Daily room
2. Connect to room
3. Wait for agent to join
4. Send text message
5. Wait for text response
6. Disconnect and print result

Usage:
    python smoke_chat.py "<prompt>"
    python smoke_chat.py "I have chest pain"
"""

import asyncio
import json
import os
import sys
import time
from pathlib import Path

# Load environment from repo root
root_env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
if root_env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(root_env_path)

import aiohttp
from daily import Daily, CallClient, EventHandler

# Timeout settings
AGENT_JOIN_TIMEOUT = 30  # seconds
RESPONSE_TIMEOUT = 30  # seconds

TESTER_NAME = "smoke-tester"


async def create_daily_room() -> dict:
    """Create a temporary Daily room for testing."""
    daily_api_key = os.getenv("DAILY_API_KEY")
    if not daily_api_key:
        raise ValueError("DAILY_API_KEY is required")

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.daily.co/v1/rooms",
            headers={
                "Authorization": f"Bearer {daily_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "properties": {
                    "exp": int(time.time()) + 600,  # 10 min expiry
                    "enable_chat": True,
                }
            },
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                raise ValueError(f"Failed to create room: {response.status} - {error_text}")
            return await response.json()


async def get_meeting_token(room_name: str) -> str:
    """Get a meeting token for the room."""
    daily_api_key = os.getenv("DAILY_API_KEY")

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.daily.co/v1/meeting-tokens",
            headers={
                "Authorization": f"Bearer {daily_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "properties": {
                    "room_name": room_name,
                    "exp": int(time.time()) + 600,
                    "user_name": TESTER_NAME,
                }
            },
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                raise ValueError(f"Failed to get token: {response.status} - {error_text}")
            data = await response.json()
            return data["token"]


class SmokeTestEventHandler(EventHandler):
    """Event handler for the smoke test client."""

    def __init__(self, client: "SmokeTestClient"):
        super().__init__()
        self.client = client

    def on_participant_joined(self, participant):
        """Handle participant joined event."""
        info = participant.get("info", {})
        user_name = info.get("userName", "")
        participant_id = info.get("participantId", "")

        print(f"[SmokeTest] Participant joined: {user_name} ({participant_id})")

        # Check if this is the agent (not us)
        if user_name != TESTER_NAME and "agent" in user_name.lower():
            self.client.agent_id = participant_id
            self.client._schedule_event(self.client.agent_joined)

    def on_participant_left(self, participant, reason):
        """Handle participant left event."""
        info = participant.get("info", {})
        user_name = info.get("userName", "")
        print(f"[SmokeTest] Participant left: {user_name} - {reason}")

    def on_app_message(self, message, sender):
        """Handle incoming app message."""
        print(f"[SmokeTest] App message from {sender}: {message}")

        # Check if this is from the agent (not us)
        sender_name = sender if isinstance(sender, str) else str(sender)
        if sender_name != TESTER_NAME and sender_name != "local":
            # Extract text from message
            if isinstance(message, dict):
                text = message.get("text", message.get("message", str(message)))
            elif isinstance(message, str):
                try:
                    parsed = json.loads(message)
                    text = parsed.get("text", parsed.get("message", message))
                except json.JSONDecodeError:
                    text = message
            else:
                text = str(message)

            self.client.agent_response = text
            self.client._schedule_event(self.client.response_received)


class SmokeTestClient:
    """Client for running smoke test against the text agent."""

    def __init__(self):
        self.call_client = None
        self.agent_joined = asyncio.Event()
        self.response_received = asyncio.Event()
        self.agent_response = None
        self.agent_id = None
        self._loop = None

    def _schedule_event(self, event: asyncio.Event):
        """Thread-safe way to set an asyncio Event from a callback."""
        if self._loop:
            self._loop.call_soon_threadsafe(event.set)

    async def run(self, room_url: str, token: str, prompt: str) -> dict:
        """Run the smoke test."""
        # Store event loop for thread-safe callbacks
        self._loop = asyncio.get_running_loop()

        # Initialize Daily
        Daily.init()

        # Create event handler
        event_handler = SmokeTestEventHandler(self)

        # Create call client with event handler
        self.call_client = CallClient(event_handler=event_handler)

        # Set user name
        self.call_client.set_user_name(TESTER_NAME)

        # Set up subscription profiles (no audio/video)
        self.call_client.update_subscription_profiles({
            "base": {
                "camera": "unsubscribed",
                "microphone": "unsubscribed",
            }
        })

        # Join the room
        print(f"[SmokeTest] Joining room: {room_url}")
        join_complete = asyncio.Event()
        join_error = None

        def on_join_complete(result, error):
            nonlocal join_error
            join_error = error
            if error:
                print(f"[SmokeTest] Join error: {error}")
            else:
                print(f"[SmokeTest] Joined successfully")
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

        # Check existing participants for agent
        participants = self.call_client.participants()
        for pid, pinfo in participants.items():
            if pid != "local":
                user_name = pinfo.get("info", {}).get("userName", "")
                if "agent" in user_name.lower():
                    self.agent_id = pid
                    self.agent_joined.set()
                    break

        # Wait for agent to join
        print("[SmokeTest] Waiting for agent to join...")
        try:
            await asyncio.wait_for(self.agent_joined.wait(), timeout=AGENT_JOIN_TIMEOUT)
            print(f"[SmokeTest] Agent joined: {self.agent_id}")
        except asyncio.TimeoutError:
            raise TimeoutError("Agent did not join in time")

        # Wait a moment for agent to initialize
        await asyncio.sleep(2)

        # Check for greeting response (agent sends greeting on first participant join)
        if self.response_received.is_set():
            print(f"[SmokeTest] Received agent greeting: {self.agent_response[:50]}...")
            # Reset for next message
            self.response_received.clear()
            self.agent_response = None

        # Send our prompt (None = broadcast to all)
        print(f"[SmokeTest] Sending prompt: {prompt}")
        self.call_client.send_app_message(
            {"text": prompt, "sender": TESTER_NAME}
        )

        # Wait for response
        print("[SmokeTest] Waiting for agent response...")
        try:
            await asyncio.wait_for(self.response_received.wait(), timeout=RESPONSE_TIMEOUT)
        except asyncio.TimeoutError:
            raise TimeoutError("Agent did not respond in time")

        # Disconnect
        print("[SmokeTest] Disconnecting...")
        self.call_client.leave()

        return {
            "room_url": room_url,
            "prompt": prompt,
            "response": self.agent_response,
        }


async def run_smoke_chat(prompt: str, room_url: str = None, token: str = None):
    """Run smoke chat test."""
    print("=" * 60)
    print("Pipecat Text Agent Smoke Chat")
    print("=" * 60)
    print("")

    # Create room if not provided
    if not room_url:
        print("Creating Daily room...")
        room_data = await create_daily_room()
        room_url = room_data["url"]
        room_name = room_data["name"]
        print(f"Room: {room_url}")

        # Get token
        token = await get_meeting_token(room_name)
    else:
        print(f"Using provided room: {room_url}")

    # Run the test
    client = SmokeTestClient()

    try:
        result = await client.run(room_url, token, prompt)

        print("")
        print("=" * 60)
        print("RESULT")
        print("=" * 60)
        print(f"Room: {result['room_url']}")
        print(f"Prompt: {result['prompt']}")
        print(f"Agent response: {result['response']}")
        print("")

        return result

    except TimeoutError as e:
        print(f"ERROR: {e}")
        return None
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return None


def main():
    if len(sys.argv) < 2:
        print('Usage: python smoke_chat.py "<prompt>"')
        print('Example: python smoke_chat.py "I have chest pain"')
        sys.exit(1)

    prompt = " ".join(sys.argv[1:])

    # Validate environment
    if not os.getenv("DAILY_API_KEY"):
        print("Error: DAILY_API_KEY is required in .env")
        sys.exit(1)

    # Check for room URL override
    room_url = os.getenv("DAILY_ROOM_URL")
    token = os.getenv("DAILY_ROOM_TOKEN")

    result = asyncio.run(run_smoke_chat(prompt, room_url, token))

    if result:
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
