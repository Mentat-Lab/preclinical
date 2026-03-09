"""
Local BrowserUse API wrapper.

Exposes the same REST API as BrowserUse Cloud (sessions + tasks)
so the existing browser provider can point here instead.
"""

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from browser_use import Agent
from browser_use.browser.session import BrowserSession
from langchain_openai import ChatOpenAI

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", None)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
CHROME_PATH = os.getenv("CHROME_PATH", None)

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

class CreateTaskRequest(BaseModel):
    task: str
    sessionId: str
    maxSteps: int = 15
    structuredOutput: str | None = None
    startUrl: str | None = None


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
    return ChatOpenAI(**kwargs)


# ---------------------------------------------------------------------------
# Routes — mirrors BrowserUse Cloud API v2
# ---------------------------------------------------------------------------

@app.post("/api/v2/sessions")
async def create_session():
    session_id = str(uuid.uuid4())
    browser_session = BrowserSession(
        headless=True,
        executable_path=CHROME_PATH,
    )
    sessions[session_id] = browser_session
    return {"id": session_id, "live_url": ""}


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
    try:
        llm = get_llm()
        agent = Agent(
            task=body.task,
            llm=llm,
            browser=browser_session,
            max_actions_per_step=body.maxSteps,
            use_vision=True,
        )
        result = await agent.run()

        # Extract the final result
        output = ""
        parsed: dict[str, Any] = {}

        final_text = result.final_result() if result else ""

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
            parsed = {"bot_response": output, "response_received": bool(output)}

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


@app.patch("/api/v2/sessions/{session_id}")
async def patch_session(session_id: str, body: PatchSessionRequest):
    if body.action == "stop" and session_id in sessions:
        browser_session = sessions.pop(session_id)
        try:
            await browser_session.close()
        except Exception:
            pass
    return {"status": "stopped"}


@app.get("/health")
async def health():
    return {"status": "ok"}
