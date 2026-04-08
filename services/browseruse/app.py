"""
Local BrowserUse API wrapper.

Exposes the same REST API as BrowserUse Cloud (sessions + tasks)
so the existing browser provider can point here instead.

Requires a Chrome pool running on the host via CDP.
  Set CDP_URL=http://host.docker.internal:9222 to configure.
  Run 'make chrome' on the host to launch Chrome instances on ports 9222-9226.
  Will NOT fall back to headless Chromium (sites like chatgpt.com block it).

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
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from browser_use import Agent, ChatOpenAI
from browser_use.browser.profile import BrowserProfile
from browser_use.browser.session import BrowserSession

# AgentMail — optional, for disposable email inboxes during signup flows
try:
    from agentmail import AsyncAgentMail  # type: ignore
    from email_tools import EmailTools
    AGENTMAIL_AVAILABLE = True
except ImportError:
    AGENTMAIL_AVAILABLE = False

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", None)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
_CDP_URL_RAW = os.getenv("CDP_URL", None)  # e.g. http://host.docker.internal:9222
MAX_CHROME_INSTANCES = int(os.getenv("MAX_CHROME_INSTANCES", "5"))

BROWSER_DATA_DIR = os.getenv("BROWSER_DATA_DIR", "/data/browser-profiles")
STORAGE_STATE_DIR = os.getenv("STORAGE_STATE_DIR", "/data/storage-states")
CONVERSATION_LOG_DIR = os.getenv("CONVERSATION_LOG_DIR", "/data/conversation-logs")
GIF_OUTPUT_DIR = os.getenv("GIF_OUTPUT_DIR", "/data/gifs")

# Ensure dirs exist
for d in [BROWSER_DATA_DIR, STORAGE_STATE_DIR, CONVERSATION_LOG_DIR, GIF_OUTPUT_DIR]:
    Path(d).mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Chrome Pool — manages multiple host Chrome instances via CDP
# ---------------------------------------------------------------------------

@dataclass
class ChromeSlot:
    port: int
    ws_url: str  # resolved ws:// devtools URL
    session_id: str | None = None  # which session owns this slot
    in_use: bool = False


class ChromePool:
    """Pool of host Chrome instances on consecutive ports (9222, 9223, ...)."""

    def __init__(self, base_url: str, max_instances: int = 5):
        parsed = urlparse(base_url)
        self.hostname = parsed.hostname or "host.docker.internal"
        self.scheme = parsed.scheme or "http"
        self.base_port = parsed.port or 9222
        self.max_instances = max_instances
        self.slots: list[ChromeSlot] = []
        self._lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(max_instances)

    async def discover(self) -> int:
        """Probe ports to find available Chrome instances."""
        self.slots.clear()
        async with httpx.AsyncClient(timeout=3) as client:
            for i in range(self.max_instances):
                port = self.base_port + i
                try:
                    ws_url = await self._resolve_ws_url(client, port)
                    self.slots.append(ChromeSlot(port=port, ws_url=ws_url))
                    print(f"[pool] Chrome found on port {port}")
                except Exception:
                    # No Chrome on this port — stop scanning
                    if i == 0:
                        raise RuntimeError(f"No Chrome on base port {self.base_port}")
                    break
        print(f"[pool] {len(self.slots)} Chrome instance(s) available")
        return len(self.slots)

    async def acquire(self, session_id: str) -> ChromeSlot:
        """Get a free Chrome slot. Blocks if all are busy (up to pool size)."""
        await self._semaphore.acquire()
        async with self._lock:
            for slot in self.slots:
                if not slot.in_use:
                    slot.in_use = True
                    slot.session_id = session_id
                    # Re-resolve ws_url in case Chrome restarted
                    try:
                        async with httpx.AsyncClient(timeout=3) as client:
                            slot.ws_url = await self._resolve_ws_url(client, slot.port)
                    except Exception:
                        pass
                    print(f"[pool] Assigned port {slot.port} to session {session_id[:8]}")
                    return slot
        # Should not happen (semaphore guards this), but just in case
        self._semaphore.release()
        raise HTTPException(status_code=503, detail="No Chrome slots available")

    async def release(self, session_id: str):
        """Release a Chrome slot back to the pool."""
        async with self._lock:
            for slot in self.slots:
                if slot.session_id == session_id:
                    slot.in_use = False
                    slot.session_id = None
                    print(f"[pool] Released port {slot.port} from session {session_id[:8]}")
                    self._semaphore.release()
                    return
        # Session wasn't in the pool — release semaphore anyway to avoid deadlock
        self._semaphore.release()

    async def _resolve_ws_url(self, client: httpx.AsyncClient, port: int) -> str:
        """Resolve the full ws:// devtools URL from a Chrome instance.

        Chrome >=146 rejects Host headers that aren't localhost or an IP,
        so we set Host: localhost:<port>.
        """
        url = f"{self.scheme}://{self.hostname}:{port}/json/version"
        resp = await client.get(url, headers={"Host": f"localhost:{port}"})
        resp.raise_for_status()
        ws_url = resp.json()["webSocketDebuggerUrl"]
        # Rewrite localhost to actual hostname for Docker networking
        return ws_url.replace("localhost", self.hostname)

    @property
    def size(self) -> int:
        return len(self.slots)

    @property
    def available(self) -> int:
        return sum(1 for s in self.slots if not s.in_use)


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

sessions: dict[str, BrowserSession] = {}
tasks: dict[str, dict[str, Any]] = {}
session_slots: dict[str, ChromeSlot] = {}  # session_id → pool slot
session_email_tools: dict[str, "EmailTools"] = {}  # session_id → EmailTools (AgentMail)
chrome_pool: ChromePool | None = None


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global chrome_pool

    # Initialize Chrome pool — required for browser tests
    if _CDP_URL_RAW:
        pool = ChromePool(_CDP_URL_RAW, max_instances=MAX_CHROME_INSTANCES)
        # Retry discovery a few times — Chrome may still be starting
        for attempt in range(3):
            try:
                count = await pool.discover()
                chrome_pool = pool
                print(f"[pool] Chrome pool ready: {count} instance(s)")
                break
            except Exception as e:
                if attempt < 2:
                    print(f"[pool] Chrome not ready (attempt {attempt + 1}/3): {e}")
                    await asyncio.sleep(3)
                else:
                    print(f"[pool] Chrome pool init failed after 3 attempts: {e}")
                    print("[pool] ⚠ No Chrome available — browser tests will fail.")
                    print("[pool] Run 'make chrome' on the host to start Chrome instances.")
    else:
        print("[pool] ⚠ CDP_URL not set — browser tests will fail.")
        print("[pool] Set CDP_URL and run 'make chrome' on the host.")

    yield

    for sid, session in list(sessions.items()):
        try:
            await session.close()
        except Exception:
            pass
    sessions.clear()
    session_slots.clear()
    session_email_tools.clear()
    chrome_pool = None


app = FastAPI(title="BrowserUse Local", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    domain: str | None = None
    allowed_domains: list[str] | None = None
    agentmail_api_key: str | None = None  # creates a disposable inbox for signup flows


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


async def create_browser_session(
    session_id: str,
    domain: str | None = None,
    allowed_domains: list[str] | None = None,
) -> BrowserSession:
    """Create a BrowserSession — pool > single CDP > headless."""
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

    if not chrome_pool:
        raise HTTPException(
            status_code=503,
            detail="No Chrome instances available. Run 'make chrome' on the host first.",
        )

    # Acquire a dedicated Chrome from the pool
    slot = await chrome_pool.acquire(session_id)
    session_slots[session_id] = slot
    profile_kwargs["cdp_url"] = slot.ws_url

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
    browser_session = await create_browser_session(session_id, domain, allowed_domains)
    sessions[session_id] = browser_session

    # Create AgentMail inbox for this session (optional — for signup/email-verification flows)
    inbox_address = ""
    agentmail_key = body.agentmail_api_key if body else None
    if agentmail_key and AGENTMAIL_AVAILABLE:
        try:
            client = AsyncAgentMail(api_key=agentmail_key)
            inbox = await client.inboxes.create()
            tools = EmailTools(email_client=client, inbox=inbox)
            session_email_tools[session_id] = tools
            inbox_address = inbox.inbox_id
            print(f"[agentmail] Created inbox {inbox_address} for session {session_id[:8]}")
        except Exception as e:
            print(f"[agentmail] Failed to create inbox: {e}")
    elif agentmail_key and not AGENTMAIL_AVAILABLE:
        print("[agentmail] ⚠ agentmail_api_key provided but agentmail package not installed")

    return {"id": session_id, "live_url": "", "domain": domain, "inbox_address": inbox_address}


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

        # Attach AgentMail email tools if this session has an inbox
        if body.sessionId in session_email_tools:
            agent_kwargs["tools"] = session_email_tools[body.sessionId]

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
            "isSuccess": bool(output),
            "output": output,
            "parsed": parsed,
        }
        if not output:
            print(f"[task {task_id}] ⚠ Finished but no response extracted — marked as failed")
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
        # Release the Chrome slot back to the pool
        if session_id in session_slots:
            await chrome_pool.release(session_id)
            del session_slots[session_id]
        # Clean up AgentMail tools
        session_email_tools.pop(session_id, None)
    return {"status": "stopped"}


@app.get("/health")
async def health():
    pool_info = {}
    if chrome_pool:
        pool_info = {
            "pool_size": chrome_pool.size,
            "pool_available": chrome_pool.available,
        }
    return {
        "status": "ok",
        "cdp_mode": bool(chrome_pool),
        "version": "v2",
        **pool_info,
    }
