"""
Local BrowserUse API wrapper.

Exposes the same REST API as BrowserUse Cloud (sessions + tasks)
so the existing browser provider can point here instead.

Supports two modes:
  - Self-contained: Launches headless Chromium inside Docker (default)
  - CDP: Connects to a real Chrome on the host via --remote-debugging-port
    Set CDP_URL=http://host.docker.internal:9222 to enable.

Enhanced features (v2):
  - Cookie/storage state persistence per domain (skip re-login)
  - sensitive_data for safe credential handling
  - extraction_schema for structured output via Pydantic
  - extend_system_message for better agent instructions
  - allowed_domains to lock agent to target site
  - save_conversation_path + generate_gif for debugging
  - Configurable step_timeout and max_actions_per_step
"""

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from browser_use import Agent, ChatOpenAI
from browser_use.browser.profile import BrowserProfile
from browser_use.browser.session import BrowserSession

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", None)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
CDP_URL = os.getenv("CDP_URL", None)  # e.g. http://host.docker.internal:9222

BROWSER_DATA_DIR = os.getenv("BROWSER_DATA_DIR", "/data/browser-profiles")
STORAGE_STATE_DIR = os.getenv("STORAGE_STATE_DIR", "/data/storage-states")
CONVERSATION_LOG_DIR = os.getenv("CONVERSATION_LOG_DIR", "/data/conversation-logs")
GIF_OUTPUT_DIR = os.getenv("GIF_OUTPUT_DIR", "/data/gifs")

# Ensure dirs exist
for d in [BROWSER_DATA_DIR, STORAGE_STATE_DIR, CONVERSATION_LOG_DIR, GIF_OUTPUT_DIR]:
    Path(d).mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

sessions: dict[str, BrowserSession] = {}
tasks: dict[str, dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    for sid, session in sessions.items():
        try:
            await session.close()
        except Exception:
            pass
    sessions.clear()


app = FastAPI(title="BrowserUse Local", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    domain: str | None = None
    allowed_domains: list[str] | None = None


class CreateTaskRequest(BaseModel):
    task: str
    sessionId: str
    maxSteps: int = 15
    structuredOutput: str | None = None
    startUrl: str | None = None
    # --- Enhanced fields ---
    sensitive_data: dict[str, str] | None = None
    extraction_schema: dict | None = None
    extend_system_message: str | None = None
    max_actions_per_step: int = 5
    step_timeout: int = 180
    use_vision: bool = True
    save_conversation: bool = False
    generate_gif: bool = False
    run_id: str | None = None


class PatchSessionRequest(BaseModel):
    action: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_llm():
    kwargs: dict[str, Any] = {"model": LLM_MODEL}
    if LLM_BASE_URL:
        kwargs["base_url"] = LLM_BASE_URL
    if OPENAI_API_KEY:
        kwargs["api_key"] = OPENAI_API_KEY
    # add_schema_to_system_prompt avoids response_format which some gateways reject
    kwargs["add_schema_to_system_prompt"] = True
    return ChatOpenAI(**kwargs)


def storage_state_path(domain: str) -> str:
    """Per-domain storage state file for cookie persistence."""
    safe_domain = domain.replace("/", "_").replace(":", "_")
    return os.path.join(STORAGE_STATE_DIR, f"{safe_domain}.json")


def load_storage_state(domain: str) -> dict | None:
    """Load saved cookies/storage for a domain, if available."""
    path = storage_state_path(domain)
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                state = json.load(f)
            print(f"[storage] Restored storage state for {domain}")
            return state
        except Exception as e:
            print(f"[storage] Failed to load storage state for {domain}: {e}")
    return None


def extract_domain(url: str) -> str:
    """Extract domain from URL."""
    try:
        parsed = urlparse(url)
        return parsed.hostname.replace("www.", "") if parsed.hostname else ""
    except Exception:
        return ""


def create_browser_session(
    domain: str | None = None,
    allowed_domains: list[str] | None = None,
) -> BrowserSession:
    """Create a BrowserSession — via CDP if configured, otherwise self-contained."""
    # Try to restore storage state for this domain
    restored_state = load_storage_state(domain) if domain else None

    profile_kwargs: dict[str, Any] = {
        "keep_alive": True,
        "highlight_elements": False,
    }

    if restored_state:
        profile_kwargs["storage_state"] = restored_state

    if allowed_domains:
        profile_kwargs["allowed_domains"] = allowed_domains

    if CDP_URL:
        profile_kwargs["cdp_url"] = CDP_URL
    else:
        profile_kwargs["headless"] = True
        profile_kwargs["user_data_dir"] = BROWSER_DATA_DIR

    profile = BrowserProfile(**profile_kwargs)
    return BrowserSession(browser_profile=profile)


# ---------------------------------------------------------------------------
# Routes — mirrors BrowserUse Cloud API v2 (enhanced)
# ---------------------------------------------------------------------------

@app.post("/api/v2/sessions")
async def create_session(body: CreateSessionRequest | None = None):
    session_id = str(uuid.uuid4())
    domain = body.domain if body else None
    allowed_domains = body.allowed_domains if body else None
    browser_session = create_browser_session(domain, allowed_domains)
    sessions[session_id] = browser_session
    return {"id": session_id, "live_url": "", "domain": domain}


@app.get("/api/v2/tasks/{task_id}")
async def get_task(task_id: str):
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]


@app.post("/api/v2/tasks")
async def create_task(body: CreateTaskRequest):
    if body.sessionId not in sessions:
        raise HTTPException(status_code=400, detail="session is stopped")

    browser_session = sessions[body.sessionId]
    task_id = str(uuid.uuid4())

    tasks[task_id] = {"id": task_id, "status": "started", "isSuccess": False}
    asyncio.create_task(_run_agent(task_id, browser_session, body))

    return {"id": task_id}


async def _run_agent(task_id: str, browser_session: BrowserSession, body: CreateTaskRequest):
    # Resolve domain once for cookie persistence (used in both success and failure paths)
    domain = extract_domain(body.startUrl) if body.startUrl else ""

    try:
        llm = get_llm()

        # Build agent kwargs
        agent_kwargs: dict[str, Any] = {
            "task": body.task,
            "llm": llm,
            "browser_session": browser_session,
            "use_vision": body.use_vision,
            "max_actions_per_step": body.max_actions_per_step,
            "step_timeout": body.step_timeout,
        }

        # Sensitive data (credentials) — domain-locked
        if body.sensitive_data:
            agent_kwargs["sensitive_data"] = body.sensitive_data

        # Structured extraction schema
        if body.extraction_schema:
            agent_kwargs["extraction_schema"] = body.extraction_schema

        # Extend system message with overlay hints, chat instructions, etc.
        if body.extend_system_message:
            agent_kwargs["extend_system_message"] = body.extend_system_message

        # Debug: save conversation log
        if body.save_conversation:
            run_id = body.run_id or task_id
            conv_path = os.path.join(CONVERSATION_LOG_DIR, f"{run_id}.json")
            agent_kwargs["save_conversation_path"] = conv_path

        # Debug: generate GIF
        if body.generate_gif:
            run_id = body.run_id or task_id
            gif_path = os.path.join(GIF_OUTPUT_DIR, f"{run_id}.gif")
            agent_kwargs["generate_gif"] = gif_path

        agent = Agent(**agent_kwargs)
        result = await agent.run(max_steps=body.maxSteps)

        # Extract the final result
        output = ""
        parsed: dict[str, Any] = {}

        final_text = result.final_result() if result else ""
        print(f"[task {task_id}] final_result={repr(final_text)[:200]}, is_done={result.is_done() if result else None}, is_successful={result.is_successful() if result else None}")

        if final_text:
            # Try to parse as JSON (structured output)
            try:
                parsed = json.loads(final_text)
            except (json.JSONDecodeError, TypeError):
                parsed = {"bot_response": final_text, "response_received": True}
            output = final_text
        else:
            # Fallback: extract from history
            if result and result.history:
                for item in reversed(result.history):
                    if item.result:
                        for r in item.result:
                            if r.extracted_content:
                                output = r.extracted_content
                                break
                    if output:
                        break
                # Also try last done action text
                if not output:
                    for item in reversed(result.history):
                        if item.result:
                            for r in item.result:
                                if r.is_done and hasattr(r, 'text'):
                                    output = r.text or ""
                                    break
                        if output:
                            break
            parsed = {"bot_response": output, "response_received": bool(output)}
            print(f"[task {task_id}] fallback output={repr(output)[:200]}")

        tasks[task_id] = {
            "id": task_id,
            "status": "finished",
            "isSuccess": True,
            "output": output,
            "parsed": parsed,
        }
    except Exception as e:
        tasks[task_id] = {
            "id": task_id,
            "status": "failed",
            "isSuccess": False,
            "output": str(e),
            "parsed": {},
        }
    finally:
        # Always save cookies — even if the task failed, login may have succeeded.
        # This prevents re-login on every retry when the failure was post-login
        # (e.g. chat input not found, extraction timeout, etc.)
        if domain:
            await _save_storage_state(browser_session, domain)


async def _save_storage_state(browser_session: BrowserSession, domain: str):
    """Save cookies/storage state for a domain after a successful task."""
    try:
        path = storage_state_path(domain)
        await browser_session.export_storage_state(output_path=path)
        print(f"[storage] Saved storage state for {domain} → {path}")
    except Exception as e:
        print(f"[storage] Failed to save storage state for {domain}: {e}")


@app.patch("/api/v2/sessions/{session_id}")
async def patch_session(session_id: str, body: PatchSessionRequest):
    if body.action == "stop" and session_id in sessions:
        browser_session = sessions.pop(session_id)
        try:
            # Force close to clean up tabs in CDP mode
            await browser_session.close(force=True)
        except Exception:
            pass
    return {"status": "stopped"}


@app.get("/health")
async def health():
    return {"status": "ok", "cdp_mode": bool(CDP_URL), "version": "v2"}
