"""Pydantic v2 models for Preclinical API responses."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class Agent(BaseModel):
    """An agent configured for testing."""

    id: str
    provider: str
    name: str
    description: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TestRun(BaseModel):
    """A test run executing scenarios against an agent."""

    id: str
    test_run_id: str | None = None
    agent_id: str | None = None
    agent_type: str | None = None
    agent_name: str | None = None
    name: str | None = None
    status: str = "pending"
    total_scenarios: int = 0
    passed_count: int = 0
    failed_count: int = 0
    error_count: int = 0
    pass_rate: float = 0.0
    benchmark_mode: bool = False
    creative_mode: bool = False
    max_turns: int | None = None
    concurrency_limit: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    canceled_at: datetime | None = None
    created_at: datetime | None = None


class ScenarioRun(BaseModel):
    """A single scenario execution within a test run."""

    id: str
    test_run_id: str
    scenario_id: str | None = None
    status: str = "pending"
    transcript: list[dict[str, Any]] | None = None
    metadata: dict[str, Any] | None = None
    error_message: str | None = None
    error_code: str | None = None
    duration_ms: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    canceled_at: datetime | None = None
    created_at: datetime | None = None
    scenario_name: str | None = None
    passed: bool | None = None
    grade_summary: str | None = None
    criteria_results: list[dict[str, Any]] | None = None


class Scenario(BaseModel):
    """A test scenario definition."""

    scenario_id: str
    name: str
    category: str | None = None
    scenario_type: str | None = None
    content: dict[str, Any] = Field(default_factory=dict)
    rubric_criteria: list[dict[str, Any]] | None = None
    is_active: bool = True
    approved: bool = False
    priority: int | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class StartRunResponse(BaseModel):
    """Response returned when a test run is started."""

    id: str
    test_run_id: str
    status: str
    total_scenarios: int
    scenarios_launched: int


class RunsList(BaseModel):
    """Paginated list of test runs."""

    runs: list[TestRun]
    total: int


class ScenarioRunsList(BaseModel):
    """Paginated list of scenario run results."""

    results: list[ScenarioRun]
    total: int


class ScenariosList(BaseModel):
    """List of scenarios."""

    scenarios: list[Scenario]
    total: int


class HealthCheckEntry(BaseModel):
    """A single health check result."""

    status: str
    detail: str


class HealthCheck(BaseModel):
    """Health check response."""

    status: str
    timestamp: str | None = None
    error: str | None = None
    checks: dict[str, HealthCheckEntry] = Field(default_factory=dict)
    setup: dict[str, Any] = Field(default_factory=dict)


class SSEEvent(BaseModel):
    """A server-sent event from the watch stream."""

    event: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    id: str | None = None
