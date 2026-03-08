"""
Pipeline Integration Test for Pipecat Agent

Tests the core LLM + TTS services:
1. Creates the LLM and TTS services
2. Sends a test message
3. Verifies the agent generates an appropriate response

This tests the actual OpenAI API integration.
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

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from openai import AsyncOpenAI

from bot import SYSTEM_PROMPT, AGENT_NAME


async def run_llm_test(test_prompt: str = "Hello, I need to schedule an appointment for a checkup."):
    """Test the LLM service directly using OpenAI SDK."""
    print("=" * 60)
    print("PIPECAT LLM INTEGRATION TEST")
    print("=" * 60)
    print(f"\nTest prompt: {test_prompt}\n")

    # Validate environment
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        print("ERROR: OPENAI_API_KEY is required")
        return False

    openai_base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

    try:
        # Step 1: Initialize OpenAI client
        print("Step 1: Initializing OpenAI client...")
        client = AsyncOpenAI(
            api_key=openai_api_key,
            base_url=openai_base_url,
        )
        print(f"  Endpoint: {openai_base_url}")

        # Step 2: Set up messages with system prompt
        print("\nStep 2: Setting up conversation context...")
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": test_prompt},
        ]
        print(f"  System prompt: {len(SYSTEM_PROMPT)} characters (Robin healthcare persona)")
        print(f"  User message: {test_prompt}")

        # Step 3: Get LLM response
        print("\nStep 3: Getting LLM response...")

        # TrueFoundry gateway requires openai-main/ prefix
        model = "gpt-4o-mini"
        if "truefoundry" in openai_base_url.lower() or "openai.com" not in openai_base_url.lower():
            model = "openai-main/gpt-4o-mini"
            print(f"  Using gateway model name: {model}")

        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            stream=True,
        )

        response_text = ""
        async for chunk in response:
            if chunk.choices and chunk.choices[0].delta.content:
                response_text += chunk.choices[0].delta.content
                print(".", end="", flush=True)

        print()  # newline after dots

        # Step 4: Analyze response
        print("\n" + "=" * 60)
        print("LLM TEST RESULTS")
        print("=" * 60)

        has_response = len(response_text) > 0
        print(f"Response received:      {'PASS' if has_response else 'FAIL'}")
        print(f"Response length:        {len(response_text)} characters")

        if response_text:
            print(f"\nAgent response:")
            print("-" * 40)
            print(response_text[:800] + "..." if len(response_text) > 800 else response_text)
            print("-" * 40)

            # Verify response is healthcare-related
            healthcare_keywords = ["wellness", "alliance", "robin", "appointment", "health", "medical", "help", "assist", "schedule", "call", "today"]
            response_lower = response_text.lower()
            keyword_match = any(kw in response_lower for kw in healthcare_keywords)
            print(f"\nHealthcare context:     {'PASS' if keyword_match else 'WARN'}")

        print(f"\nOVERALL: {'PASS' if has_response else 'FAIL'}")
        return has_response

    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


async def run_tts_test():
    """Test Cartesia TTS service."""
    print("\n" + "=" * 60)
    print("CARTESIA TTS INTEGRATION TEST")
    print("=" * 60)

    cartesia_api_key = os.getenv("CARTESIA_API_KEY")
    if not cartesia_api_key:
        print("ERROR: CARTESIA_API_KEY is required")
        return False

    try:
        import aiohttp

        print("\nStep 1: Initializing Cartesia TTS...")
        print("  Voice: British Lady (professional, warm)")

        print("\nStep 2: Generating test audio...")
        test_text = "Thank you for calling Wellness Alliance Medical Group. How may I help you today?"

        # Use Cartesia API directly
        async with aiohttp.ClientSession() as session:
            async with session.post(
                "https://api.cartesia.ai/tts/bytes",
                headers={
                    "X-API-Key": cartesia_api_key,
                    "Cartesia-Version": "2024-06-10",
                    "Content-Type": "application/json",
                },
                json={
                    "model_id": "sonic-english",  # Cheapest model (English-only)
                    "transcript": test_text,
                    "voice": {
                        "mode": "id",
                        "id": "79a125e8-cd45-4c13-8a67-188112f4dd22",  # British Lady
                    },
                    "output_format": {
                        "container": "raw",
                        "encoding": "pcm_s16le",
                        "sample_rate": 24000,
                    },
                },
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"\nERROR: Cartesia API returned {response.status}")
                    print(f"  {error_text[:200]}")
                    return False

                audio_content = await response.read()
                print(f"  Audio generated: {len(audio_content)} bytes")

        print("\n" + "=" * 60)
        print("TTS TEST RESULTS")
        print("=" * 60)

        has_audio = len(audio_content) > 0
        print(f"Audio received:         {'PASS' if has_audio else 'FAIL'}")
        print(f"Audio size:             {len(audio_content)} bytes")

        print(f"\nOVERALL: {'PASS' if has_audio else 'FAIL'}")
        return has_audio

    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    prompt = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Hello, I need to schedule an appointment for a checkup."

    llm_ok = await run_llm_test(prompt)
    tts_ok = await run_tts_test()

    print("\n" + "=" * 60)
    print("FINAL SUMMARY")
    print("=" * 60)
    print(f"LLM Test (OpenAI):     {'PASS' if llm_ok else 'FAIL'}")
    print(f"TTS Test (Cartesia):   {'PASS' if tts_ok else 'FAIL'}")

    overall = llm_ok and tts_ok
    print(f"Overall:               {'PASS' if overall else 'FAIL'}")

    return overall


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
