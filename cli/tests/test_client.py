"""Tests for Preclinical methods."""

from __future__ import annotations

import pytest

from preclinical.client import Preclinical
from preclinical.exceptions import NotFoundError, PreclinicalAPIError, APIValidationError
from preclinical.models import (
    Agent,
    HealthCheck,
    RunsList,
    Scenario,
    ScenarioRun,
    ScenarioRunsList,
    ScenariosList,
    StartRunResponse,
    TestRun,
)
from conftest import (
    SAMPLE_AGENT,
    SAMPLE_AGENT_2,
    SAMPLE_HEALTH,
    SAMPLE_RUN,
    SAMPLE_SCENARIO,
    SAMPLE_SCENARIO_RUN,
    SAMPLE_START_RUN_RESPONSE,
    MockTransport,
)


# ── Health ────────────────────────────────────────────────────────────


class TestHealth:
    def test_health_ok(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/health", 200, SAMPLE_HEALTH)
        result = client.health()
        assert isinstance(result, HealthCheck)
        assert result.status == "ok"
        assert "database" in result.checks
        assert result.checks["database"].status == "ok"


# ── Agents ────────────────────────────────────────────────────────────


class TestAgents:
    def test_list_agents(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/api/v1/agents", 200, [SAMPLE_AGENT, SAMPLE_AGENT_2])
        agents = client.list_agents()
        assert len(agents) == 2
        assert isinstance(agents[0], Agent)
        assert agents[0].id == "agt-001"
        assert agents[1].provider == "vapi"

    def test_get_agent(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/api/v1/agents/agt-001", 200, SAMPLE_AGENT)
        agent = client.get_agent("agt-001")
        assert isinstance(agent, Agent)
        assert agent.name == "Test Agent"
        assert agent.config == {"model": "gpt-4"}

    def test_get_agent_not_found(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/api/v1/agents/bad-id", 404, {"error": "Agent not found"})
        with pytest.raises(NotFoundError) as exc_info:
            client.get_agent("bad-id")
        assert exc_info.value.status_code == 404

    def test_create_agent(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("POST", "/api/v1/agents", 201, SAMPLE_AGENT)
        agent = client.create_agent(provider="openai", name="Test Agent", config={"model": "gpt-4"})
        assert isinstance(agent, Agent)
        assert agent.id == "agt-001"

    def test_create_agent_validation_error(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("POST", "/api/v1/agents", 400, {"error": "provider and name are required"})
        with pytest.raises(APIValidationError):
            client.create_agent(provider="", name="")

    def test_update_agent(self, client: Preclinical, mock_transport: MockTransport) -> None:
        updated = {**SAMPLE_AGENT, "name": "Updated Agent"}
        mock_transport.add_response("PATCH", "/api/v1/agents/agt-001", 200, updated)
        agent = client.update_agent("agt-001", name="Updated Agent")
        assert agent.name == "Updated Agent"

    def test_delete_agent(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("DELETE", "/api/v1/agents/agt-001", 204, None)
        client.delete_agent("agt-001")  # Should not raise


# ── Test Runs ─────────────────────────────────────────────────────────


class TestRuns:
    def test_start_run(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("POST", "/start-run", 200, SAMPLE_START_RUN_RESPONSE)
        result = client.start_run(agent_id="agt-001", max_turns=5)
        assert isinstance(result, StartRunResponse)
        assert result.status == "running"
        assert result.total_scenarios == 5

    def test_cancel_run(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("POST", "/cancel-run", 200, {"status": "canceled", "canceled_scenarios": 3})
        result = client.cancel_run("run-uuid-001")
        assert result["status"] == "canceled"

    def test_list_runs(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/api/v1/tests", 200, {"runs": [SAMPLE_RUN], "total": 1})
        result = client.list_runs(limit=10)
        assert isinstance(result, RunsList)
        assert result.total == 1
        assert len(result.runs) == 1
        assert isinstance(result.runs[0], TestRun)

    def test_get_run(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/api/v1/tests/run-uuid-001", 200, SAMPLE_RUN)
        run = client.get_run("run-uuid-001")
        assert isinstance(run, TestRun)
        assert run.pass_rate == 80.0

    def test_delete_run(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("DELETE", "/api/v1/tests/run-uuid-001", 204, None)
        client.delete_run("run-uuid-001")


# ── Scenarios ─────────────────────────────────────────────────────────


class TestScenarios:
    def test_list_scenarios(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/api/v1/scenarios", 200, {"scenarios": [SAMPLE_SCENARIO], "total": 1})
        result = client.list_scenarios()
        assert isinstance(result, ScenariosList)
        assert result.total == 1
        assert result.scenarios[0].name == "Chest Pain Triage"

    def test_list_scenarios_with_tag(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/api/v1/scenarios", 200, {"scenarios": [SAMPLE_SCENARIO], "total": 1})
        result = client.list_scenarios(tag="cardiac")
        assert result.total == 1

    def test_get_scenario(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/api/v1/scenarios/scn-001", 200, SAMPLE_SCENARIO)
        scenario = client.get_scenario("scn-001")
        assert isinstance(scenario, Scenario)
        assert scenario.tags == ["cardiac", "emergency"]

    def test_update_scenario(self, client: Preclinical, mock_transport: MockTransport) -> None:
        updated = {**SAMPLE_SCENARIO, "name": "Updated Scenario"}
        mock_transport.add_response("PATCH", "/api/v1/scenarios/scn-001", 200, updated)
        scenario = client.update_scenario("scn-001", name="Updated Scenario")
        assert scenario.name == "Updated Scenario"

    def test_delete_scenario(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("DELETE", "/api/v1/scenarios/scn-001", 204, None)
        client.delete_scenario("scn-001")

    def test_generate_scenario(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("POST", "/api/v1/scenarios/generate", 201, SAMPLE_SCENARIO)
        scenario = client.generate_scenario(text="Patient presents with chest pain...")
        assert isinstance(scenario, Scenario)
        assert scenario.name == "Chest Pain Triage"

    def test_generate_scenarios_batch(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("POST", "/api/v1/scenarios/generate-batch", 201, {
            "scenarios": [SAMPLE_SCENARIO], "total": 1,
        })
        result = client.generate_scenarios_batch(text="Large clinical document...")
        assert isinstance(result, ScenariosList)
        assert result.total == 1


# ── Scenario Runs ─────────────────────────────────────────────────────


class TestScenarioRuns:
    def test_list_scenario_runs(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/api/v1/scenario-runs", 200, {
            "results": [SAMPLE_SCENARIO_RUN], "total": 1,
        })
        result = client.list_scenario_runs(test_run_id="run-uuid-001")
        assert isinstance(result, ScenarioRunsList)
        assert result.total == 1
        assert result.results[0].passed is True

    def test_get_scenario_run(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/api/v1/scenario-runs/sr-001", 200, SAMPLE_SCENARIO_RUN)
        sr = client.get_scenario_run("sr-001")
        assert isinstance(sr, ScenarioRun)
        assert sr.grade_summary == "Agent correctly triaged chest pain"
        assert len(sr.transcript) == 2


# ── Error handling ────────────────────────────────────────────────────


class TestErrors:
    def test_server_error(self, client: Preclinical, mock_transport: MockTransport) -> None:
        mock_transport.add_response("GET", "/health", 503, {"status": "error", "error": "DB down"})
        with pytest.raises(PreclinicalAPIError) as exc_info:
            client.health()
        assert exc_info.value.status_code == 503
