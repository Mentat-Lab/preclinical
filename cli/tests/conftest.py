"""Shared fixtures for Preclinical SDK and CLI tests."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from preclinical.client import Preclinical

# ── Sample data ───────────────────────────────────────────────────────

SAMPLE_AGENT: dict[str, Any] = {
    "id": "agt-001",
    "provider": "openai",
    "name": "Test Agent",
    "description": "A test agent",
    "config": {"model": "gpt-4"},
    "is_active": True,
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z",
}

SAMPLE_AGENT_2: dict[str, Any] = {
    "id": "agt-002",
    "provider": "vapi",
    "name": "Voice Agent",
    "description": None,
    "config": {},
    "is_active": True,
    "created_at": "2025-01-02T00:00:00Z",
    "updated_at": "2025-01-02T00:00:00Z",
}

SAMPLE_RUN: dict[str, Any] = {
    "id": "run-uuid-001",
    "test_run_id": "run_20250101120000_abcd",
    "agent_id": "agt-001",
    "agent_type": "openai",
    "agent_name": "Test Agent",
    "name": "Nightly run",
    "status": "completed",
    "total_scenarios": 10,
    "passed_count": 8,
    "failed_count": 1,
    "error_count": 1,
    "pass_rate": 80.0,
    "benchmark_mode": False,
    "max_turns": 6,
    "concurrency_limit": 6,
    "started_at": "2025-01-01T12:00:00Z",
    "completed_at": "2025-01-01T12:30:00Z",
    "created_at": "2025-01-01T12:00:00Z",
}

SAMPLE_START_RUN_RESPONSE: dict[str, Any] = {
    "id": "run-uuid-001",
    "test_run_id": "run_20250101120000_abcd",
    "status": "running",
    "total_scenarios": 5,
    "scenarios_launched": 5,
}

SAMPLE_SCENARIO: dict[str, Any] = {
    "scenario_id": "scn-001",
    "name": "Chest Pain Triage",
    "category": "emergency",
    "scenario_type": "adversarial",
    "content": {"chief_complaint": "chest pain", "demographics": {"age": 55}},
    "rubric_criteria": [
        {"criterion": "Asked about onset", "weight": 1},
        {"criterion": "Asked about severity", "weight": 1},
    ],
    "is_active": True,
    "approved": True,
    "priority": 1,
    "tags": ["cardiac", "emergency"],
    "created_at": "2025-01-01T00:00:00Z",
}

SAMPLE_SCENARIO_RUN: dict[str, Any] = {
    "id": "sr-001",
    "test_run_id": "run-uuid-001",
    "scenario_id": "scn-001",
    "status": "passed",
    "transcript": [
        {"role": "user", "content": "I have chest pain"},
        {"role": "assistant", "content": "When did the pain start?"},
    ],
    "metadata": {},
    "error_message": None,
    "duration_ms": 12345,
    "started_at": "2025-01-01T12:00:00Z",
    "completed_at": "2025-01-01T12:02:00Z",
    "scenario_name": "Chest Pain Triage",
    "passed": True,
    "grade_summary": "Agent correctly triaged chest pain",
    "criteria_results": [
        {"criterion": "Asked about onset", "met": True, "evidence": "Turn 2"},
        {"criterion": "Asked about severity", "met": True, "evidence": "Turn 3"},
    ],
}

SAMPLE_HEALTH: dict[str, Any] = {
    "status": "ok",
    "timestamp": "2025-01-01T00:00:00Z",
    "checks": {
        "database": {"status": "ok", "detail": "Database connection succeeded."},
        "tester_model": {"status": "ok", "detail": "Tester model is configured for Anthropic."},
        "grader_model": {"status": "ok", "detail": "Grader model is configured for Anthropic."},
        "browser_provider": {"status": "warning", "detail": "BROWSER_USE_API_KEY is missing."},
    },
    "setup": {
        "tester_model": "claude-sonnet-4-20250514",
        "grader_model": "claude-sonnet-4-20250514",
        "worker_concurrency": 6,
    },
}


# ── Fixtures ──────────────────────────────────────────────────────────


class MockTransport(httpx.BaseTransport):
    """Transport that returns pre-configured responses based on request path/method."""

    def __init__(self) -> None:
        self.responses: list[tuple[str, str, int, Any]] = []

    def add_response(self, method: str, path: str, status_code: int, json_data: Any) -> None:
        """Register a response for a given method+path."""
        self.responses.append((method.upper(), path, status_code, json_data))

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        """Match request against registered responses."""
        for method, path, status_code, json_data in self.responses:
            if request.method == method and request.url.path == path:
                if status_code == 204:
                    return httpx.Response(status_code=status_code)
                return httpx.Response(
                    status_code=status_code,
                    json=json_data,
                    headers={"content-type": "application/json"},
                )
        return httpx.Response(
            status_code=404,
            json={"error": f"No mock for {request.method} {request.url.path}"},
            headers={"content-type": "application/json"},
        )


@pytest.fixture
def mock_transport() -> MockTransport:
    """Provide a configurable mock transport."""
    return MockTransport()


@pytest.fixture
def client(mock_transport: MockTransport) -> Preclinical:
    """Provide a Preclinical backed by mock transport."""
    c = Preclinical.__new__(Preclinical)
    c._base_url = "http://localhost:3000"
    c._api_key = None
    c._client = httpx.Client(
        base_url="http://localhost:3000",
        transport=mock_transport,
        headers={"Content-Type": "application/json"},
    )
    return c
