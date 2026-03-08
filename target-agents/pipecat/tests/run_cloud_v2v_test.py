#!/usr/bin/env python3
"""
Pipecat Cloud voice-to-voice style test (message loop) with transcript output.

Creates a Pipecat Cloud session, sends tester messages, and records agent responses.
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

# Load environment from repo root if python-dotenv is available
root_env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
if root_env_path.exists():
    loaded = False
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv(root_env_path)
        loaded = True
    except Exception:
        loaded = False
    if not loaded:
        # Minimal .env parser fallback (KEY=VALUE, ignore comments/blank lines)
        for line in root_env_path.read_text().splitlines():
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            key = key.strip()
            value = value.strip().strip("\"'")
            if key and key not in os.environ:
                os.environ[key] = value


def http_json(method: str, url: str, headers: Dict[str, str], body: Optional[Dict] = None, timeout_seconds: int = 30) -> Dict:
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as err:
        try:
            error_text = err.read().decode("utf-8")
        except Exception:
            error_text = str(err)
        raise RuntimeError(f"HTTP {err.code} for {url}: {error_text}") from err
    except URLError as err:
        raise RuntimeError(f"Request failed for {url}: {err}") from err


def require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def pick_room_url(session: Dict) -> str:
    for key in ("dailyRoom", "dailyRoomUrl", "roomUrl", "room_url"):
        value = session.get(key)
        if value:
            return value
    raise RuntimeError("Pipecat Cloud session did not include a Daily room URL.")


def start_pipecat_session(base_url: str, api_key: str, agent_name: str) -> Dict:
    url = f"{base_url}/v1/public/{agent_name}/start"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "createDailyRoom": True,
        "transport": "daily",
        "body": {
            "source": "local-v2v-test",
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }
    return http_json("POST", url, headers, body)


def send_pipecat_message(base_url: str, api_key: str, agent_name: str, session_id: str, room_url: str, message: str) -> str:
    url = f"{base_url}/v1/public/{agent_name}/sessions/{session_id}/message"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    body = {
        "message": message,
        "room_url": room_url,
        "session_id": session_id,
    }
    last_error: Optional[Exception] = None
    for attempt in range(2):
        try:
            response = http_json("POST", url, headers, body, timeout_seconds=120)
            for key in ("response", "message", "text"):
                if key in response and response[key]:
                    return str(response[key])
            return ""
        except Exception as err:
            last_error = err
            time.sleep(3)
    if last_error:
        raise last_error
    return ""


def end_pipecat_session(base_url: str, api_key: str, agent_name: str, session_id: str) -> None:
    url = f"{base_url}/v1/public/{agent_name}/sessions/{session_id}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    try:
        http_json("DELETE", url, headers, None)
    except Exception:
        # Best-effort cleanup
        pass


def build_tester_messages(initial_prompt: str, turns: int) -> List[str]:
    followups = [
        "I want to schedule something this week if possible.",
        "It would be for a routine checkup, no urgent symptoms.",
        "I prefer mornings, but afternoons could work too.",
        "My name is Priya Patel and my date of birth is March 12, 1991.",
        "I have Aetna insurance, if that matters.",
        "I also need to ask about a prescription refill for my inhaler.",
        "Is there anything I should bring to the appointment?",
        "Also, do you offer telehealth if in-person isn't available?",
        "I can do next Tuesday or Thursday, whichever you have open.",
    ]
    messages = [initial_prompt]
    while len(messages) < turns:
        messages.append(followups[(len(messages) - 1) % len(followups)])
    return messages[:turns]


def run_conversation(turns: int, initial_prompt: str, base_url_override: Optional[str]) -> List[Dict[str, str]]:
    base_url = base_url_override or os.getenv("PIPECAT_CLOUD_API_URL") or os.getenv("PIPECAT_BASE_URL") or os.getenv("PIPECAT_API_URL") or "https://api.pipecat.daily.co"
    base_url = base_url.rstrip("/")
    api_key = os.getenv("PIPECAT_CLOUD_API_KEY") or os.getenv("PIPECAT_API_KEY") or ""
    if not api_key:
        raise RuntimeError("Missing required env var: PIPECAT_CLOUD_API_KEY (or PIPECAT_API_KEY)")
    agent_name = os.getenv("PIPECAT_AGENT_NAME", "preclinical-pipecat-agent")

    session = start_pipecat_session(base_url, api_key, agent_name)
    session_id = session.get("sessionId") or session.get("session_id")
    if not session_id:
        raise RuntimeError("Pipecat Cloud session did not include a session ID.")

    room_url = pick_room_url(session)
    transcript: List[Dict[str, str]] = []

    tester_messages = build_tester_messages(initial_prompt, turns)

    try:
        time.sleep(3)
        for idx, tester_message in enumerate(tester_messages, start=1):
            transcript.append({"role": "tester", "content": tester_message})
            agent_response = send_pipecat_message(
                base_url,
                api_key,
                agent_name,
                session_id,
                room_url,
                tester_message,
            )
            transcript.append({"role": "agent", "content": agent_response})
    finally:
        end_pipecat_session(base_url, api_key, agent_name, session_id)

    return transcript


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Run Pipecat Cloud v2v-style test and print transcript")
    parser.add_argument("--turns", type=int, default=10, help="Number of tester turns (default: 10)")
    parser.add_argument(
        "--prompt",
        type=str,
        default="I need to schedule an appointment for a checkup.",
        help="Initial tester prompt",
    )
    parser.add_argument(
        "--base-url",
        type=str,
        default="",
        help="Override Pipecat Cloud API base URL",
    )

    args = parser.parse_args()

    if args.turns < 1:
        print("Turns must be >= 1", file=sys.stderr)
        return 1

    transcript = run_conversation(args.turns, args.prompt, args.base_url.strip() or None)

    print("\n" + "=" * 60)
    print("PIPECAT CLOUD V2V TEST TRANSCRIPT")
    print("=" * 60)
    print(f"Tester turns: {args.turns}")
    print("")

    for idx, entry in enumerate(transcript, start=1):
        role = entry["role"]
        content = entry["content"]
        print(f"{idx:02d}. [{role}] {content}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
