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
from dataclasses import dataclass
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

# Browserbase — optional, cloud Chrome instances via CDP
try:
    from browserbase import Browserbase
    BROWSERBASE_AVAILABLE = True
except ImportError:
    BROWSERBASE_AVAILABLE = False

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", None)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
_CDP_URL_RAW = os.getenv("CDP_URL", None)  # e.g. http://host.docker.internal:9222
MAX_CHROME_INSTANCES = int(os.getenv("MAX_CHROME_INSTANCES", "5"))

# Browserbase — cloud Chrome (feature flag: set BROWSERBASE_API_KEY to enable)
BROWSERBASE_API_KEY = os.getenv("BROWSERBASE_API_KEY", "")
BROWSERBASE_PROJECT_ID = os.getenv("BROWSERBASE_PROJECT_ID", "")
USE_BROWSERBASE = bool(BROWSERBASE_API_KEY) and BROWSERBASE_AVAILABLE

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
# Browserbase Backend — cloud Chrome instances via CDP
# ---------------------------------------------------------------------------

@dataclass
class BrowserbaseSlot:
    """Represents a Browserbase cloud browser session."""
    bb_session_id: str
    connect_url: str  # CDP WebSocket URL
    context_id: str | None = None
    session_id: str | None = None  # our internal session_id


BROWSERBASE_CONTEXTS_PATH = os.path.join(STORAGE_STATE_DIR, "browserbase-contexts.json")


class BrowserbaseBackend:
    """Cloud browser backend via Browserbase API.

    Persists domain → {context_id, email} to a JSON file so logins
    survive container restarts. First run uses AgentMail to sign up;
    subsequent runs reuse the saved Browserbase Context (already authenticated).
    """

    def __init__(self, api_key: str, project_id: str):
        self.client = Browserbase(api_key=api_key)
        self.project_id = project_id
        self._contexts: dict[str, dict[str, str]] = {}  # domain -> {context_id, email}
        self._lock = asyncio.Lock()
        self._load()

    def _load(self):
        """Load persisted contexts from disk."""
        if os.path.exists(BROWSERBASE_CONTEXTS_PATH):
            try:
                with open(BROWSERBASE_CONTEXTS_PATH, "r") as f:
                    self._contexts = json.load(f)
                print(f"[browserbase] Loaded {len(self._contexts)} saved context(s)")
            except Exception as e:
                print(f"[browserbase] Failed to load contexts: {e}")

    def _save(self):
        """Persist contexts to disk."""
        try:
            with open(BROWSERBASE_CONTEXTS_PATH, "w") as f:
                json.dump(self._contexts, f, indent=2)
        except Exception as e:
            print(f"[browserbase] Failed to save contexts: {e}")

    def has_context(self, domain: str) -> bool:
        """Check if a domain already has a saved context (i.e. already signed up)."""
        return domain in self._contexts

    def get_email(self, domain: str) -> str:
        """Get the saved email for a domain, if any."""
        return self._contexts.get(domain, {}).get("email", "")

    async def acquire(self, session_id: str, domain: str | None = None, context_id: str | None = None) -> BrowserbaseSlot:
        """Create a Browserbase session and return the CDP connect URL.

        If context_id is provided explicitly (from agent config), use it directly
        with persist=False (read-only — safe for parallel test runs).
        Auto-created contexts use persist=True (need to save login cookies).
        """
        explicit_context = bool(context_id)
        if not context_id and domain:
            context_id = await self._get_or_create_context(domain)

        create_kwargs: dict[str, Any] = {}
        if self.project_id:
            create_kwargs["project_id"] = self.project_id
        if context_id:
            # Pre-authenticated contexts: persist=False (read-only, safe for parallel runs)
            # Auto-created contexts: persist=True (need to save login state)
            create_kwargs["browser_settings"] = {
                "context": {"id": context_id, "persist": not explicit_context}
            }

        bb_session = self.client.sessions.create(**create_kwargs)
        slot = BrowserbaseSlot(
            bb_session_id=bb_session.id,
            connect_url=bb_session.connect_url,
            context_id=context_id,
            session_id=session_id,
        )
        print(f"[browserbase] Created session {bb_session.id} for {session_id[:8]}")
        return slot

    async def release(self, slot: BrowserbaseSlot):
        """Release a Browserbase session (stops billing)."""
        try:
            self.client.sessions.update(
                slot.bb_session_id,
                status="REQUEST_RELEASE",
            )
            print(f"[browserbase] Released session {slot.bb_session_id}")
        except Exception as e:
            print(f"[browserbase] Failed to release session {slot.bb_session_id}: {e}")

    async def save_context_email(self, domain: str, email: str):
        """Save the email used for signup so we know this domain is authenticated."""
        async with self._lock:
            if domain in self._contexts:
                self._contexts[domain]["email"] = email
                self._save()
                print(f"[browserbase] Saved email {email} for {domain}")

    async def _get_or_create_context(self, domain: str) -> str:
        """Get or create a Browserbase Context for persistent auth per domain."""
        async with self._lock:
            if domain in self._contexts:
                ctx_id = self._contexts[domain]["context_id"]
                print(f"[browserbase] Reusing context {ctx_id} for {domain}")
                return ctx_id
            create_kwargs: dict[str, Any] = {}
            if self.project_id:
                create_kwargs["project_id"] = self.project_id
            ctx = self.client.contexts.create(**create_kwargs)
            self._contexts[domain] = {"context_id": ctx.id, "email": ""}
            self._save()
            print(f"[browserbase] Created context {ctx.id} for {domain}")
            return ctx.id


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

sessions: dict[str, BrowserSession] = {}
tasks: dict[str, dict[str, Any]] = {}
session_slots: dict[str, ChromeSlot] = {}  # session_id → pool slot
session_bb_slots: dict[str, BrowserbaseSlot] = {}  # session_id → Browserbase slot
session_email_tools: dict[str, "EmailTools"] = {}  # session_id → EmailTools (AgentMail)
session_domains: dict[str, str] = {}  # session_id → domain
chrome_pool: ChromePool | None = None
browserbase_backend: BrowserbaseBackend | None = None


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global chrome_pool, browserbase_backend

    if USE_BROWSERBASE:
        # Browserbase mode — cloud Chrome, no local Chrome needed
        browserbase_backend = BrowserbaseBackend(BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID)
        print("[browserbase] Browserbase backend enabled — cloud Chrome sessions")
    elif _CDP_URL_RAW:
        # Local Chrome pool mode (existing behavior)
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
        print("[pool] ⚠ CDP_URL not set and BROWSERBASE_API_KEY not set — browser tests will fail.")
        print("[pool] Set CDP_URL + run 'make chrome', or set BROWSERBASE_API_KEY for cloud Chrome.")

    yield

    # Cleanup Browserbase sessions
    if browserbase_backend:
        for sid, bb_slot in list(session_bb_slots.items()):
            try:
                await browserbase_backend.release(bb_slot)
            except Exception:
                pass
        session_bb_slots.clear()

    for sid, session in list(sessions.items()):
        try:
            await session.close()
        except Exception:
            pass
    sessions.clear()
    session_slots.clear()
    session_email_tools.clear()
    session_domains.clear()
    chrome_pool = None
    browserbase_backend = None


app = FastAPI(title="BrowserUse Local", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CreateSessionRequest(BaseModel):
    domain: str | None = None
    allowed_domains: list[str] | None = None
    agentmail_api_key: str | None = None  # creates a disposable inbox for signup flows
    browserbase_context_id: str | None = None  # pre-authenticated Browserbase context (skips login)


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


class DiscoverRequest(BaseModel):
    url: str
    email: str | None = None
    password: str | None = None
    validate: bool = True  # send a test message to confirm chat works


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
    browserbase_context_id: str | None = None,
) -> BrowserSession:
    """Create a BrowserSession — Browserbase cloud or local Chrome pool."""
    profile_kwargs: dict[str, Any] = {
        "keep_alive": True,
        "highlight_elements": False,
    }

    if allowed_domains:
        profile_kwargs["allowed_domains"] = allowed_domains

    if browserbase_backend:
        # Browserbase mode — cloud Chrome via CDP
        bb_slot = await browserbase_backend.acquire(session_id, domain, browserbase_context_id)
        session_bb_slots[session_id] = bb_slot
        profile_kwargs["cdp_url"] = bb_slot.connect_url
    else:
        # Local Chrome pool mode
        restored_state = load_storage_state(domain) if domain else None
        if restored_state:
            profile_kwargs["storage_state"] = restored_state

        if not chrome_pool:
            raise HTTPException(
                status_code=503,
                detail="No Chrome instances available. Run 'make chrome' on the host first.",
            )

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
    bb_context_id = body.browserbase_context_id if body else None
    browser_session = await create_browser_session(session_id, domain, allowed_domains, bb_context_id)
    sessions[session_id] = browser_session
    if domain:
        session_domains[session_id] = domain

    # Skip AgentMail when using a pre-authenticated Browserbase context
    already_authenticated = bool(bb_context_id) or (
        browserbase_backend
        and domain
        and browserbase_backend.has_context(domain)
        and browserbase_backend.get_email(domain)
    )

    # Create AgentMail inbox for this session (optional — for signup/email-verification flows)
    inbox_address = ""
    agentmail_key = body.agentmail_api_key if body else None
    if already_authenticated:
        print(f"[browserbase] Domain {domain} already authenticated — skipping AgentMail signup")
    elif agentmail_key and AGENTMAIL_AVAILABLE:
        try:
            client = AsyncAgentMail(api_key=agentmail_key)
            inbox = await client.inboxes.create()
            tools = EmailTools(email_client=client, inbox=inbox)
            session_email_tools[session_id] = tools
            inbox_address = inbox.inbox_id
            print(f"[agentmail] Created inbox {inbox_address} for session {session_id[:8]}")
            # Save the email to the Browserbase context so future runs skip signup
            if browserbase_backend and domain:
                await browserbase_backend.save_context_email(domain, inbox_address)
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

        # Use the agent's own success flag — not just "has output".
        # The agent may return text like "I could not complete..." which is output
        # but not success. The TS provider checks isSuccess for AgentMail fallback.
        agent_succeeded = result.is_successful() if result else False
        tasks[task_id] = {
            "id": task_id,
            "status": "finished",
            "isSuccess": agent_succeeded if agent_succeeded is not None else bool(output),
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
        # Skip when using Browserbase (Contexts handle persistence cloud-side).
        if domain and not browserbase_backend:
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
        # Export cookies for local Chrome sessions (not Browserbase — contexts handle that)
        domain = session_domains.pop(session_id, "")
        if domain and session_id not in session_bb_slots:
            await _save_storage_state(browser_session, domain)
        try:
            # Force close to clean up tabs in CDP mode
            await browser_session.close(force=True)
        except Exception:
            pass
        # Release Browserbase session or Chrome pool slot
        if session_id in session_bb_slots:
            bb_slot = session_bb_slots.pop(session_id)
            if browserbase_backend:
                await browserbase_backend.release(bb_slot)
        elif session_id in session_slots:
            await chrome_pool.release(session_id)
            del session_slots[session_id]
        # Clean up AgentMail tools
        session_email_tools.pop(session_id, None)
    return {"status": "stopped"}


# ---------------------------------------------------------------------------
# Discovery — explore a URL and produce a browser profile
# ---------------------------------------------------------------------------

# The extraction schema asks for SPECIFIC, ACTIONABLE instructions — not vague descriptions.
# Each field maps directly to a browser profile field used at runtime.
DISCOVER_EXTRACTION_SCHEMA = {
    "requires_auth": {
        "type": "boolean",
        "description": (
            "MUST be true if you see ANY of: a login form, a sign-in button, "
            "'Continue with Google/email/SSO', a redirect to /login or /signin, "
            "or if the chat input is NOT accessible without signing in. "
            "Set false ONLY if the chat input is immediately usable without any login."
        ),
    },
    "auth_methods": {
        "type": "string",
        "description": (
            "Comma-separated list of auth methods seen. Examples: "
            "'email_password', 'google_oauth', 'sso', 'clerk', 'magic_link'. "
            "Write 'none' if no auth is required."
        ),
    },
    "login_instructions": {
        "type": "string",
        "description": (
            "Step-by-step instructions to log in, referencing SPECIFIC elements. Example: "
            "'Click the \"Log in\" button in the top-right corner. On the login page, "
            "enter email in the input with placeholder \"Enter your email\", then click "
            "\"Continue with email\". Enter password and click \"Sign in\".' "
            "Write 'not_needed' if no auth required."
        ),
    },
    "chat_input_selector": {
        "type": "string",
        "description": (
            "How to find the chat input. Be SPECIFIC: mention the HTML element type, "
            "id, placeholder text, or position. Examples: "
            "'textarea with id=\"prompt-textarea\" at the bottom of the page', "
            "'contenteditable div with placeholder \"Message ChatGPT...\" at bottom', "
            "'input field with placeholder \"Type your message\" below the chat area'. "
            "Write 'not_found' if no chat input is accessible."
        ),
    },
    "send_method": {
        "type": "string",
        "description": (
            "EXACT method to send a message. Be specific about button labels. Examples: "
            "'press Enter', 'click the arrow button to the right of the input', "
            "'click the \"Send\" button below the input'. "
            "Write 'unknown' if chat input was not found."
        ),
    },
    "wait_for_response": {
        "type": "string",
        "description": (
            "How to know the chatbot finished responding. Examples: "
            "'the send button reappears', 'the typing indicator disappears', "
            "'the \"Stop generating\" button disappears', 'the loading spinner stops'. "
            "Write 'unknown' if not observed."
        ),
    },
    "setup_steps": {
        "type": "string",
        "description": (
            "Things to handle BEFORE chatting (after login). Step-by-step. Examples: "
            "'Dismiss the cookie consent banner by clicking \"Accept\". "
            "If a demographics form appears, fill in age and gender and click Submit.' "
            "Write 'none' if no setup needed."
        ),
    },
    "intake_form_fields": {
        "type": "string",
        "description": (
            "If there is a demographics/intake form, list the EXACT field labels. Example: "
            "'Age (dropdown), Gender (radio: Male/Female/Other), Chief complaint (textarea)'. "
            "Write 'none' if no intake form."
        ),
    },
    "overlays_to_dismiss": {
        "type": "string",
        "description": (
            "SPECIFIC overlays/banners/modals that appear and how to dismiss them. Examples: "
            "'Cookie banner at bottom — click \"Accept All\"', "
            "'Welcome modal — click \"X\" in top-right corner', "
            "'\"Upgrade to Pro\" popup — click \"Maybe later\"'. "
            "Write 'none' if no overlays seen."
        ),
    },
    "persistent_ui_elements": {
        "type": "string",
        "description": (
            "Static banners, disclaimers, or UI elements that are always visible and should "
            "NOT be confused with new alerts. Examples: "
            "'\"AI can make mistakes\" disclaimer at bottom', "
            "'\"Doctronic is an AI doctor\" banner at top', "
            "'Sidebar with conversation history on the left'. "
            "Write 'none' if nothing notable."
        ),
    },
    "emergency_alert_pattern": {
        "type": "string",
        "description": (
            "If the site can show emergency/urgent-care modals or popups, describe what they "
            "look like. Example: 'Red modal with \"Please call 911\" text and a \"Close\" button'. "
            "Write 'unknown' if not observed (most sites won't show this on first visit)."
        ),
    },
    "page_type": {
        "type": "string",
        "description": (
            "One of: 'chat_ready' (chat input immediately usable), "
            "'auth_wall' (must log in first), "
            "'intake_then_chat' (form before chat), "
            "'marketing_page' (no chat on this page). "
        ),
    },
    "validation_response": {
        "type": "string",
        "description": (
            "If you were able to send the test message, paste the FULL chatbot response here. "
            "Write 'not_validated' if you could not send a test message."
        ),
    },
}

DISCOVER_SYSTEM_EXT = """## Discovery mission
You are a site analyst. Your job is to produce SPECIFIC, ACTIONABLE instructions for automating this website.

CRITICAL RULES:
- When describing elements, use EXACT text: button labels, placeholder text, element IDs, positions.
- Do NOT write vague instructions like "find the chat input". Instead write: "find the textarea with placeholder 'Message Claude...' at the bottom center of the page".
- Do NOT write vague instructions like "click the login button". Instead write: "click the 'Continue with email' button below the Google sign-in option".
- For requires_auth: if you see ANY sign-in/login/signup UI and the chat is NOT immediately accessible, set to true.
- If the page redirects you to a login page, requires_auth is true.
- Explore the page structure carefully. Note element IDs, placeholder text, aria-labels, and visual positions.
- Do NOT attempt to log in or sign up. Just observe and document what you see.
- Be thorough but efficient — you have limited steps."""


def _build_browser_profile_from_discovery(parsed: dict[str, Any], url: str) -> dict[str, Any]:
    """Convert discovery extraction output into a browser profile JSON."""
    domain = extract_domain(url)

    # --- Post-processing heuristics ---
    # Fix requires_auth: if login_instructions are specific, auth is needed
    requires_auth = parsed.get("requires_auth", False)
    login_instr = parsed.get("login_instructions", "not_needed")
    auth_methods = parsed.get("auth_methods", "none")
    page_type = parsed.get("page_type", "")
    if not requires_auth:
        # Override if the text evidence says otherwise
        if login_instr and login_instr != "not_needed":
            requires_auth = True
        elif auth_methods and auth_methods != "none":
            requires_auth = True
        elif page_type in ("auth_wall", "marketing_page"):
            requires_auth = True

    # --- Build chat instructions ---
    selector = parsed.get("chat_input_selector", "not_found")
    send = parsed.get("send_method", "unknown")
    wait = parsed.get("wait_for_response", "unknown")

    if selector and selector != "not_found":
        chat_instructions = f"Find {selector}. Click it, type the message, then {send} to send it."
        if wait and wait != "unknown":
            chat_instructions += f" Wait for the response to finish ({wait})."
        else:
            chat_instructions += " Wait for the response to finish streaming (it may stream in gradually — wait until it stops changing)."
    else:
        chat_instructions = (
            "Find the chat input field at the bottom of the page. "
            "Click it, type the message, and press Enter to send. "
            "Wait for the response to finish streaming."
        )

    # --- Build setup instructions ---
    setup_raw = parsed.get("setup_steps", "none")
    intake_raw = parsed.get("intake_form_fields", "none")
    overlays_raw = parsed.get("overlays_to_dismiss", "none")

    setup_parts = []
    if overlays_raw and overlays_raw != "none":
        setup_parts.append(overlays_raw)
    if setup_raw and setup_raw != "none":
        setup_parts.append(setup_raw)
    if intake_raw and intake_raw != "none":
        setup_parts.append(
            f"If a demographics/intake form appears with fields ({intake_raw}), "
            f"fill in age {{age}} and gender {{gender}}, then submit."
        )
    if not setup_parts:
        setup_parts.append(
            "If there is any terms/consent/agreement checkbox or button, check it and accept."
        )
    setup_instructions = " ".join(setup_parts)

    # --- Build overlay hint ---
    persistent = parsed.get("persistent_ui_elements", "none")
    emergency = parsed.get("emergency_alert_pattern", "unknown")

    overlay_parts = [
        "Only capture NEW modals or popups that appeared AFTER you sent the message "
        "(e.g. emergency alerts telling the user to call 911)."
    ]
    if persistent and persistent != "none":
        overlay_parts.append(f"Do NOT include these persistent elements: {persistent}.")
    else:
        overlay_parts.append("Do NOT include persistent banners, disclaimers, or static page text.")
    if emergency and emergency != "unknown":
        overlay_parts.append(f"Emergency alerts look like: {emergency}.")
    overlay_hint = " ".join(overlay_parts)

    # --- Build login instructions ---
    login_instructions = ""
    if requires_auth:
        if login_instr and login_instr != "not_needed":
            # Use the specific discovered instructions, with template vars
            login_instructions = (
                f"Go to {{url}}. {login_instr} "
                "Use {{email}} for the email field and {{password}} for the password field."
            )
        else:
            login_instructions = (
                "Go to {url}. Find the login or sign-in form. "
                "Enter {email} and {password}. Click the sign-in/login button. "
                "Complete any verification steps. Dismiss any popups after login."
            )

    profile: dict[str, Any] = {
        "domain": domain,
        "name": domain.split(".")[0].title() if domain else "Discovered Site",
        "requires_auth": requires_auth,
        "browser_setup_instructions": setup_instructions,
        "browser_chat_instructions": chat_instructions,
        "browser_overlay_hint": overlay_hint,
    }

    if login_instructions:
        profile["browser_login_instructions"] = login_instructions

    if auth_methods and auth_methods != "none":
        profile["auth_methods"] = auth_methods

    if page_type:
        profile["page_type"] = page_type

    return profile


async def _extract_structured_from_text(llm: Any, text: str, url: str) -> dict[str, Any]:
    """Use a second LLM call to extract structured discovery fields from free-form text."""
    schema_fields = "\n".join(
        f"- {k}: {v['description']}" for k, v in DISCOVER_EXTRACTION_SCHEMA.items()
    )

    prompt = (
        f"You are extracting structured data from a website discovery report about {url}.\n\n"
        f"DISCOVERY REPORT:\n{text[:6000]}\n\n"
        f"Extract the following fields as a JSON object. Use ONLY information from the report above.\n"
        f"For boolean fields, use true/false. For string fields, be specific and actionable.\n\n"
        f"FIELDS:\n{schema_fields}\n\n"
        f"Respond with ONLY a valid JSON object, no markdown fences, no explanation."
    )

    try:
        import openai as openai_lib
        client = openai_lib.AsyncOpenAI(
            api_key=OPENAI_API_KEY,
            base_url=LLM_BASE_URL,
        )
        response = await client.chat.completions.create(
            model=LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        content = response.choices[0].message.content or ""
        # Strip markdown fences if present
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        return json.loads(content)
    except Exception as e:
        print(f"[discover] Failed to extract structured data from text: {e}")
        # Last resort: heuristic extraction from text
        lower = text.lower()
        return {
            "requires_auth": any(kw in lower for kw in [
                "requires_auth=true", "requires auth", "login", "sign in", "sign-in",
                "redirected to", "/login", "auth wall",
            ]),
            "auth_methods": "unknown" if "login" in lower or "sign in" in lower else "none",
            "login_instructions": "not_needed",
            "chat_input_selector": "not_found" if any(
                kw in lower for kw in ["not_found", "no chat", "not accessible", "not visible"]
            ) else "unknown",
            "send_method": "unknown",
            "wait_for_response": "unknown",
            "setup_steps": "none",
            "intake_form_fields": "none",
            "overlays_to_dismiss": "none",
            "persistent_ui_elements": "none",
            "emergency_alert_pattern": "unknown",
            "page_type": "auth_wall" if "login" in lower or "auth" in lower else "unknown",
            "validation_response": "not_validated",
        }


@app.post("/api/v2/discover")
async def discover_site(body: DiscoverRequest):
    """Explore a URL and produce a structured browser profile."""
    session_id = str(uuid.uuid4())
    domain = extract_domain(body.url)

    try:
        browser_session = await create_browser_session(session_id, domain, [domain] if domain else None)
        sessions[session_id] = browser_session
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Failed to create browser session: {e}")

    try:
        llm = get_llm()

        # Build the discovery task prompt
        explore_prompt = (
            f"Go to {body.url}.\n\n"
            "YOUR MISSION: Explore this page and produce detailed, specific automation instructions.\n\n"
            "INVESTIGATE EACH OF THESE (be specific — mention exact element text, IDs, positions):\n\n"
            "1. AUTHENTICATION: Does the page require login? What sign-in options exist? "
            "List every auth button/link you see with its exact text (e.g. 'Continue with Google', 'Sign in with email'). "
            "If redirected to a login page, that means requires_auth=true.\n\n"
            "2. CHAT INPUT: Is there a chat input field accessible WITHOUT logging in? "
            "If the page is a login/auth wall, set chat_input_selector='not_found' and move on — do NOT keep searching. "
            "If there IS a chat input: what HTML element is it (textarea, input, contenteditable div)? "
            "What is its id, placeholder text, or aria-label? Where on the page? "
            "How do you send — Enter key or a button (exact button text/icon)?\n\n"
            "3. RESPONSE BEHAVIOR: How do you know when the chatbot finished responding? "
            "Does a button reappear? Does a spinner/typing indicator disappear?\n\n"
            "4. OVERLAYS & MODALS: Cookie banners, consent dialogs, welcome modals, upgrade prompts? "
            "How to dismiss each one (exact button text)?\n\n"
            "5. INTAKE FORMS: Demographics or intake form? List every field label exactly.\n\n"
            "6. PERSISTENT UI: Static elements always visible (disclaimers, sidebars, banners) "
            "that should NOT be confused with alert popups.\n\n"
        )

        if body.validate:
            explore_prompt += (
                "7. VALIDATION: If the chat is accessible without logging in, send this exact test message: "
                '"Hello, I have a quick question about a headache." '
                "Wait for the full response and capture it. "
                "If auth is required, skip this step and set validation_response='not_validated'.\n\n"
            )

        explore_prompt += (
            "CRITICAL EFFICIENCY RULES:\n"
            "- If the page redirects to a login/signin page, you are DONE with exploration. "
            "Set requires_auth=true, document the auth elements you see, set chat_input_selector='not_found', "
            "and finish immediately. Do NOT keep searching for chat inputs on a login page.\n"
            "- Do not repeat the same action more than once. If find_elements returns the same result twice, move on.\n"
            "- Fill out EVERY field in the extraction schema with specific details. "
            "Reference exact button text, element IDs, placeholders, and positions.\n"
            "- You have limited steps. Prioritize finishing over thoroughness."
        )

        agent_kwargs: dict[str, Any] = {
            "task": explore_prompt,
            "llm": llm,
            "browser_session": browser_session,
            "use_vision": True,
            "max_actions_per_step": 5,
            "step_timeout": 60,
            "extraction_schema": DISCOVER_EXTRACTION_SCHEMA,
            "extend_system_message": DISCOVER_SYSTEM_EXT,
        }

        if body.email and body.password:
            agent_kwargs["sensitive_data"] = {"email": body.email, "password": body.password}

        agent = Agent(**agent_kwargs)
        # Auth-wall sites need fewer steps (just observe login page).
        # Sites with accessible chat need more (explore + optionally validate).
        result = await agent.run(max_steps=15)

        # Extract structured output — try JSON first, then fall back to LLM extraction
        parsed: dict[str, Any] = {}
        final_text = result.final_result() if result else ""

        if final_text:
            try:
                parsed = json.loads(final_text)
            except (json.JSONDecodeError, TypeError):
                # Agent returned free-form text instead of JSON.
                # Use a second LLM call to extract structured fields from the text.
                parsed = await _extract_structured_from_text(llm, final_text, body.url)
        else:
            # Try to reconstruct from agent history
            history_text = ""
            if result and result.history:
                for item in reversed(result.history):
                    if item.result:
                        for r in item.result:
                            if r.extracted_content:
                                history_text = r.extracted_content
                                break
                    if history_text:
                        break
            if history_text:
                parsed = await _extract_structured_from_text(llm, history_text, body.url)
            else:
                parsed = {"page_type": "unknown", "requires_auth": False}

        # Build browser profile from discovery
        profile = _build_browser_profile_from_discovery(parsed, body.url)

        return {
            "profile": profile,
            "discovery": parsed,
            "validated": bool(
                parsed.get("validation_response")
                and parsed.get("validation_response") != "not_validated"
            ),
            "validation_response": parsed.get("validation_response", ""),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Discovery failed: {e}")
    finally:
        # Clean up session
        if session_id in sessions:
            browser_session = sessions.pop(session_id)
            try:
                await browser_session.close(force=True)
            except Exception:
                pass
            if session_id in session_bb_slots:
                bb_slot = session_bb_slots.pop(session_id)
                if browserbase_backend:
                    await browserbase_backend.release(bb_slot)
            elif session_id in session_slots and chrome_pool:
                await chrome_pool.release(session_id)
                del session_slots[session_id]


# ---------------------------------------------------------------------------
# Context Setup — create a Browserbase context + session for manual login
# ---------------------------------------------------------------------------

class SetupContextRequest(BaseModel):
    domain: str | None = None


@app.post("/api/v2/setup-context")
async def setup_context(body: SetupContextRequest | None = None):
    """Create a Browserbase context and session for manual login via live view.

    Returns the context_id and Browserbase session URL so the user can
    log in manually. Call /api/v2/setup-context/{session_id}/complete
    when done to close the session and persist cookies.
    """
    if not browserbase_backend:
        raise HTTPException(
            status_code=400,
            detail="Browserbase not configured. Set BROWSERBASE_API_KEY in .env",
        )

    domain = body.domain if body else None

    # Create a fresh context (don't reuse existing ones)
    create_kwargs: dict[str, Any] = {}
    if browserbase_backend.project_id:
        create_kwargs["project_id"] = browserbase_backend.project_id
    ctx = browserbase_backend.client.contexts.create(**create_kwargs)
    context_id = ctx.id
    print(f"[setup-context] Created context {context_id} for domain {domain or 'unknown'}")

    # Create a session with this context (persist=True so cookies are saved)
    session_kwargs: dict[str, Any] = {
        "browser_settings": {
            "context": {"id": context_id, "persist": True}
        }
    }
    if browserbase_backend.project_id:
        session_kwargs["project_id"] = browserbase_backend.project_id

    bb_session = browserbase_backend.client.sessions.create(**session_kwargs)
    print(f"[setup-context] Created session {bb_session.id} with context {context_id}")

    return {
        "context_id": context_id,
        "session_id": bb_session.id,
        "live_url": f"https://www.browserbase.com/sessions/{bb_session.id}",
        "connect_url": bb_session.connect_url,
    }


@app.post("/api/v2/setup-context/{session_id}/complete")
async def complete_context_setup(session_id: str):
    """Close the setup session so cookies persist to the context."""
    if not browserbase_backend:
        raise HTTPException(status_code=400, detail="Browserbase not configured")

    try:
        browserbase_backend.client.sessions.update(
            session_id,
            status="REQUEST_RELEASE",
        )
        print(f"[setup-context] Released session {session_id}")
    except Exception as e:
        print(f"[setup-context] Failed to release session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to close session: {e}")

    return {"status": "completed"}


@app.get("/health")
async def health():
    pool_info = {}
    if browserbase_backend:
        pool_info = {
            "backend": "browserbase",
            "active_sessions": len(session_bb_slots),
        }
    elif chrome_pool:
        pool_info = {
            "backend": "chrome_pool",
            "pool_size": chrome_pool.size,
            "pool_available": chrome_pool.available,
        }
    return {
        "status": "ok",
        "cdp_mode": bool(chrome_pool) or bool(browserbase_backend),
        "version": "v2",
        **pool_info,
    }
