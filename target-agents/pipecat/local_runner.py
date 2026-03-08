"""
Local Runner for Pipecat Agent

Creates a Daily room and runs the agent locally for testing.
"""

import os
import sys
from pathlib import Path

# Load environment from repo root
root_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if root_env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(root_env_path)

import aiohttp


async def create_daily_room() -> dict:
    """Create a temporary Daily room for testing."""
    daily_api_key = os.getenv("DAILY_API_KEY")
    if not daily_api_key:
        raise ValueError("DAILY_API_KEY is required for local development. Set it in .env at repo root.")

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "https://api.daily.co/v1/rooms",
            headers={
                "Authorization": f"Bearer {daily_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "properties": {
                    "exp": int(__import__("time").time()) + 3600,  # 1 hour expiry
                    "enable_chat": True,
                    "enable_screenshare": False,
                    "start_video_off": True,
                    "start_audio_off": False,
                }
            },
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                raise ValueError(f"Failed to create Daily room: {response.status} - {error_text}")
            return await response.json()


async def get_meeting_token(room_name: str, owner: bool = True) -> str:
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
                    "is_owner": owner,
                    "exp": int(__import__("time").time()) + 3600,
                }
            },
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                raise ValueError(f"Failed to get meeting token: {response.status} - {error_text}")
            data = await response.json()
            return data["token"]


async def run_local():
    """Create a room and run the agent locally."""
    print("Creating Daily room for local testing...")

    room_data = await create_daily_room()
    room_url = room_data["url"]
    room_name = room_data["name"]

    print(f"\n{'='*60}")
    print(f"Room created: {room_url}")
    print(f"{'='*60}")
    print(f"\nJoin this room in your browser to test the agent.")
    print(f"The agent will greet you when you join.\n")
    print(f"Press Ctrl+C to stop the agent.\n")

    # Get a token for the agent
    token = await get_meeting_token(room_name, owner=True)

    # Run the agent
    from bot import run_agent
    await run_agent(room_url, token)


if __name__ == "__main__":
    import asyncio
    asyncio.run(run_local())
