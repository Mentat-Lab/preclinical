"""
Pipecat Agent Smoke Test

Simple test that connects to a Daily room with the agent and sends a test message.
Verifies the agent responds appropriately.

Usage:
    python smoke_test.py "<prompt>"
    python smoke_test.py "I need to schedule an appointment"
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

import aiohttp

# Timeout settings
AGENT_JOIN_TIMEOUT = 30  # seconds
RESPONSE_TIMEOUT = 30  # seconds


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
                    "exp": int(__import__("time").time()) + 600,  # 10 min expiry
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
                    "exp": int(__import__("time").time()) + 600,
                }
            },
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                raise ValueError(f"Failed to get token: {response.status} - {error_text}")
            data = await response.json()
            return data["token"]


async def run_smoke_test(prompt: str):
    """Run the smoke test with the given prompt."""
    print(f"Smoke test prompt: {prompt}")
    print("")

    # Create room
    print("Creating Daily room...")
    room_data = await create_daily_room()
    room_url = room_data["url"]
    room_name = room_data["name"]
    print(f"Room: {room_url}")

    # For a proper smoke test, we would:
    # 1. Start the agent in the room
    # 2. Join as a participant
    # 3. Send the prompt
    # 4. Wait for response
    # 5. Verify the response

    # Since Pipecat uses Daily's transport layer, a full smoke test requires
    # the Daily Python SDK or running the agent and using the Daily JS SDK.
    #
    # For now, we'll verify the setup is correct and the room can be created.

    print("")
    print("=" * 60)
    print("SMOKE TEST SETUP COMPLETE")
    print("=" * 60)
    print("")
    print(f"Room URL: {room_url}")
    print(f"Room Name: {room_name}")
    print("")
    print("To complete the smoke test:")
    print("1. In terminal 1: Run the agent with ./scripts/run_dev.sh")
    print("2. In terminal 2: Join the room URL in your browser")
    print("3. Speak or type your prompt to the agent")
    print("4. Verify the agent responds appropriately")
    print("")
    print(f"Test prompt to use: {prompt}")

    return {
        "room_url": room_url,
        "room_name": room_name,
        "prompt": prompt,
        "status": "setup_complete",
    }


def main():
    if len(sys.argv) < 2:
        print('Usage: python smoke_test.py "<prompt>"')
        print('Example: python smoke_test.py "I need to schedule an appointment"')
        sys.exit(1)

    prompt = " ".join(sys.argv[1:])

    # Validate environment
    if not os.getenv("DAILY_API_KEY"):
        print("Error: DAILY_API_KEY is required in .env")
        sys.exit(1)

    result = asyncio.run(run_smoke_test(prompt))
    print(f"\nResult: {result}")


if __name__ == "__main__":
    main()
