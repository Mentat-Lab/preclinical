"""Tests for Preclinical CLI commands using Typer's CliRunner."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

from preclinical.cli.app import app
from preclinical.exceptions import NotFoundError, PreclinicalAPIError
from preclinical.models import (
    Agent,
    HealthCheck,
    HealthCheckEntry,
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
)

runner = CliRunner()


def _mock_client() -> MagicMock:
    """Create a MagicMock that stands in for PreclinicalClient."""
    return MagicMock()


# ── Version ───────────────────────────────────────────────────────────


class TestVersion:
    def test_version_flag(self) -> None:
        result = runner.invoke(app, ["--version"])
        assert result.exit_code == 0
        assert "0.3.0" in result.output


# ── Health ────────────────────────────────────────────────────────────


class TestHealthCLI:
    @patch("preclinical.cli.app.get_client")
    def test_health(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.health.return_value = HealthCheck.model_validate(SAMPLE_HEALTH)
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["health"])
        assert result.exit_code == 0
        assert "ok" in result.output

    @patch("preclinical.cli.app.get_client")
    def test_health_json(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.health.return_value = HealthCheck.model_validate(SAMPLE_HEALTH)
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["health", "--json"])
        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert parsed["status"] == "ok"


# ── Agents CLI ────────────────────────────────────────────────────────


class TestAgentsCLI:
    @patch("preclinical.cli.agents._get_client")
    def test_agents_list(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.list_agents.return_value = [
            Agent.model_validate(SAMPLE_AGENT),
            Agent.model_validate(SAMPLE_AGENT_2),
        ]
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["agents", "list"])
        assert result.exit_code == 0
        assert "Test Agent" in result.output
        assert "Voice Agent" in result.output

    @patch("preclinical.cli.agents._get_client")
    def test_agents_list_json(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.list_agents.return_value = [Agent.model_validate(SAMPLE_AGENT)]
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["agents", "list", "--json"])
        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert len(parsed) == 1
        assert parsed[0]["id"] == "agt-001"

    @patch("preclinical.cli.agents._get_client")
    def test_agents_get(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.get_agent.return_value = Agent.model_validate(SAMPLE_AGENT)
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["agents", "get", "agt-001"])
        assert result.exit_code == 0
        assert "Test Agent" in result.output

    @patch("preclinical.cli.agents._get_client")
    def test_agents_get_not_found(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.get_agent.side_effect = NotFoundError("Agent not found")
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["agents", "get", "bad-id"])
        assert result.exit_code == 1

    @patch("preclinical.cli.agents._get_client")
    def test_agents_create(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.create_agent.return_value = Agent.model_validate(SAMPLE_AGENT)
        mock_get.return_value = mock_client

        result = runner.invoke(app, [
            "agents", "create", "--provider", "openai", "--name", "Test Agent",
        ])
        assert result.exit_code == 0
        assert "Created agent" in result.output

    @patch("preclinical.cli.agents._get_client")
    def test_agents_create_with_config(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.create_agent.return_value = Agent.model_validate(SAMPLE_AGENT)
        mock_get.return_value = mock_client

        result = runner.invoke(app, [
            "agents", "create", "--provider", "openai", "--name", "Test Agent",
            "--config", '{"model": "gpt-4"}',
        ])
        assert result.exit_code == 0

    @patch("preclinical.cli.agents._get_client")
    def test_agents_delete(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.delete_agent.return_value = None
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["agents", "delete", "agt-001", "--force"])
        assert result.exit_code == 0
        assert "Deleted" in result.output


# ── Runs CLI ──────────────────────────────────────────────────────────


class TestRunsCLI:
    @patch("preclinical.cli.runs._get_client")
    def test_runs_list(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.list_runs.return_value = RunsList(runs=[TestRun.model_validate(SAMPLE_RUN)], total=1)
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["runs", "list"])
        assert result.exit_code == 0
        assert "run_2025" in result.output

    @patch("preclinical.cli.runs._get_client")
    def test_runs_get(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.get_run.return_value = TestRun.model_validate(SAMPLE_RUN)
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["runs", "get", "run-uuid-001"])
        assert result.exit_code == 0
        assert "80" in result.output

    @patch("preclinical.cli.runs._get_client")
    def test_runs_cancel(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.cancel_run.return_value = {"status": "canceled", "canceled_scenarios": 3}
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["runs", "cancel", "run-uuid-001"])
        assert result.exit_code == 0
        assert "Canceled" in result.output

    @patch("preclinical.cli.runs._get_client")
    def test_runs_delete(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.delete_run.return_value = None
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["runs", "delete", "run-uuid-001", "--force"])
        assert result.exit_code == 0


# ── Run command (top-level) ───────────────────────────────────────────


class TestRunCommand:
    @patch("preclinical.cli.app.get_client")
    def test_run_start(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.start_run.return_value = StartRunResponse.model_validate(SAMPLE_START_RUN_RESPONSE)
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["run", "agt-001"])
        assert result.exit_code == 0
        assert "Started run" in result.output
        assert "run_20250101120000_abcd" in result.output

    @patch("preclinical.cli.app.get_client")
    def test_run_with_options(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.start_run.return_value = StartRunResponse.model_validate(SAMPLE_START_RUN_RESPONSE)
        mock_get.return_value = mock_client

        result = runner.invoke(app, [
            "run", "agt-001",
            "--max-turns", "5",
            "--tags", "cardiac,emergency",
            "--concurrency", "3",
            "--name", "Quick test",
        ])
        assert result.exit_code == 0
        mock_client.start_run.assert_called_once_with(
            agent_id="agt-001",
            name="Quick test",
            max_turns=5,
            tags=["cardiac", "emergency"],
            scenario_ids=None,
            concurrency_limit=3,
            max_scenarios=None,
            benchmark_mode=False,
        )

    @patch("preclinical.cli.app.get_client")
    def test_run_json(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.start_run.return_value = StartRunResponse.model_validate(SAMPLE_START_RUN_RESPONSE)
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["run", "agt-001", "--json"])
        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert parsed["status"] == "running"


# ── Scenarios CLI ─────────────────────────────────────────────────────


class TestScenariosCLI:
    @patch("preclinical.cli.scenarios._get_client")
    def test_scenarios_list(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.list_scenarios.return_value = ScenariosList(
            scenarios=[Scenario.model_validate(SAMPLE_SCENARIO)], total=1,
        )
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["scenarios", "list"])
        assert result.exit_code == 0
        assert "Chest Pain" in result.output

    @patch("preclinical.cli.scenarios._get_client")
    def test_scenarios_get(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.get_scenario.return_value = Scenario.model_validate(SAMPLE_SCENARIO)
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["scenarios", "get", "scn-001"])
        assert result.exit_code == 0
        assert "Chest Pain Triage" in result.output

    @patch("preclinical.cli.scenarios._get_client")
    def test_scenarios_generate(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.generate_scenario.return_value = Scenario.model_validate(SAMPLE_SCENARIO)
        mock_get.return_value = mock_client

        result = runner.invoke(app, [
            "scenarios", "generate", "--text", "Patient with chest pain protocol...",
        ])
        assert result.exit_code == 0
        assert "Generated scenario" in result.output

    @patch("preclinical.cli.scenarios._get_client")
    def test_scenarios_delete(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.delete_scenario.return_value = None
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["scenarios", "delete", "scn-001", "--force"])
        assert result.exit_code == 0
        assert "Deleted" in result.output


# ── Results CLI ───────────────────────────────────────────────────────


class TestResultsCLI:
    @patch("preclinical.cli.results._get_client")
    def test_results_list(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.list_scenario_runs.return_value = ScenarioRunsList(
            results=[ScenarioRun.model_validate(SAMPLE_SCENARIO_RUN)], total=1,
        )
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["results", "list", "run-uuid-001"])
        assert result.exit_code == 0
        assert "Chest Pain" in result.output

    @patch("preclinical.cli.results._get_client")
    def test_results_get(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.get_scenario_run.return_value = ScenarioRun.model_validate(SAMPLE_SCENARIO_RUN)
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["results", "get", "sr-001"])
        assert result.exit_code == 0
        assert "Chest Pain" in result.output
        assert "PASS" in result.output

    @patch("preclinical.cli.results._get_client")
    def test_results_json(self, mock_get: MagicMock) -> None:
        mock_client = _mock_client()
        mock_client.list_scenario_runs.return_value = ScenarioRunsList(
            results=[ScenarioRun.model_validate(SAMPLE_SCENARIO_RUN)], total=1,
        )
        mock_get.return_value = mock_client

        result = runner.invoke(app, ["results", "list", "run-uuid-001", "--json"])
        assert result.exit_code == 0
        parsed = json.loads(result.output)
        assert parsed["total"] == 1
