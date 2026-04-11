"""Preclinical Python client — sync and async."""

from __future__ import annotations

import json
from typing import Any, AsyncIterator, Iterator

import httpx

from preclinical.config import PreclinicalConfig
from preclinical.exceptions import (
    NotFoundError,
    PreclinicalAPIError,
    APIValidationError,
)
from preclinical.models import (
    Agent,
    HealthCheck,
    RunsList,
    Scenario,
    ScenarioRun,
    ScenarioRunsList,
    ScenariosList,
    SSEEvent,
    StartRunResponse,
    TestRun,
)


def _handle_response(response: httpx.Response) -> Any:
    if response.status_code == 204:
        return None
    if response.is_success:
        return response.json()
    try:
        body = response.json()
    except Exception:
        body = {"error": response.text}
    message = body.get("error", body.get("message", response.text))
    if response.status_code == 404:
        raise NotFoundError(message=message, response=body)
    if response.status_code == 400:
        raise APIValidationError(message=message, response=body)
    raise PreclinicalAPIError(
        status_code=response.status_code,
        message=message,
        response=body,
    )


def _build_headers(api_key: str | None) -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _parse_sse_lines(lines_iter: Iterator[str]) -> Iterator[SSEEvent]:
    event_type: str | None = None
    data_lines: list[str] = []
    event_id: str | None = None

    for line in lines_iter:
        if line.startswith("event:"):
            event_type = line[len("event:"):].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:"):].strip())
        elif line.startswith("id:"):
            event_id = line[len("id:"):].strip()
        elif line.startswith(":"):
            continue
        elif line == "":
            if data_lines:
                raw_data = "\n".join(data_lines)
                try:
                    parsed = json.loads(raw_data)
                except json.JSONDecodeError:
                    parsed = {"raw": raw_data}
                yield SSEEvent(event=event_type, data=parsed, id=event_id)
            event_type = None
            data_lines = []
            event_id = None


# ---------------------------------------------------------------------------
# Sync client
# ---------------------------------------------------------------------------


class Preclinical:
    """Python client for the Preclinical platform.

    Usage::

        from preclinical import Preclinical

        client = Preclinical()

        started = client.start_run(agent_id="...")
        for event in client.watch(started.id):
            print(event)
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        config = PreclinicalConfig.load(url_override=base_url, api_key_override=api_key)
        self._base_url = config.api_url
        self._api_key = config.api_key
        self._client = httpx.Client(
            base_url=self._base_url,
            headers=_build_headers(self._api_key),
            timeout=timeout,
        )

    # ── Internal ──────────────────────────────────────────────────────

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return _handle_response(self._client.get(path, params=params))

    def _post(self, path: str, body: dict[str, Any] | None = None, timeout: float | None = None) -> Any:
        kwargs: dict[str, Any] = {"json": body or {}}
        if timeout is not None:
            kwargs["timeout"] = timeout
        return _handle_response(self._client.post(path, **kwargs))

    def _patch(self, path: str, body: dict[str, Any]) -> Any:
        return _handle_response(self._client.patch(path, json=body))

    def _delete(self, path: str) -> Any:
        return _handle_response(self._client.delete(path))

    # ── Agents ────────────────────────────────────────────────────────

    def list_agents(self) -> list[Agent]:
        return [Agent.model_validate(a) for a in self._get("/api/v1/agents")]

    def get_agent(self, agent_id: str) -> Agent:
        return Agent.model_validate(self._get(f"/api/v1/agents/{agent_id}"))

    def create_agent(
        self,
        provider: str,
        name: str,
        description: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> Agent:
        body: dict[str, Any] = {"provider": provider, "name": name}
        if description is not None:
            body["description"] = description
        if config is not None:
            body["config"] = config
        return Agent.model_validate(self._post("/api/v1/agents", body))

    def update_agent(
        self,
        agent_id: str,
        name: str | None = None,
        description: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> Agent:
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if description is not None:
            body["description"] = description
        if config is not None:
            body["config"] = config
        return Agent.model_validate(self._patch(f"/api/v1/agents/{agent_id}", body))

    def delete_agent(self, agent_id: str) -> None:
        self._delete(f"/api/v1/agents/{agent_id}")

    # ── Test Runs ─────────────────────────────────────────────────────

    def start_run(
        self,
        agent_id: str,
        *,
        test_suite_id: str | None = None,
        name: str | None = None,
        max_turns: int | None = None,
        concurrency_limit: int | None = None,
        max_scenarios: int | None = None,
        scenario_ids: list[str] | None = None,
        tags: list[str] | None = None,
        benchmark_mode: bool = False,
        creative_mode: bool = False,
    ) -> StartRunResponse:
        """Start a test run."""
        body: dict[str, Any] = {"agent_id": agent_id}
        if test_suite_id is not None:
            body["test_suite_id"] = test_suite_id
        if name is not None:
            body["name"] = name
        if max_turns is not None:
            body["max_turns"] = max_turns
        if concurrency_limit is not None:
            body["concurrency_limit"] = concurrency_limit
        if max_scenarios is not None:
            body["max_scenarios"] = max_scenarios
        if scenario_ids is not None:
            body["scenario_ids"] = scenario_ids
        if tags is not None:
            body["tags"] = tags
        if benchmark_mode:
            body["benchmark_mode"] = True
        if creative_mode:
            body["creative_mode"] = True
        return StartRunResponse.model_validate(self._post("/start-run", body))

    def get_run(self, run_id: str) -> TestRun:
        return TestRun.model_validate(self._get(f"/api/v1/tests/{run_id}"))

    def list_runs(self, limit: int | None = None, offset: int | None = None, status: str | None = None) -> RunsList:
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        if status is not None:
            params["status"] = status
        return RunsList.model_validate(self._get("/api/v1/tests", params=params))

    def cancel_run(self, test_run_id: str) -> dict[str, Any]:
        return self._post("/cancel-run", {"test_run_id": test_run_id})

    def delete_run(self, run_id: str) -> None:
        self._delete(f"/api/v1/tests/{run_id}")

    # ── Scenarios ─────────────────────────────────────────────────────

    def list_scenarios(self, tag: str | None = None) -> ScenariosList:
        params: dict[str, Any] = {}
        if tag is not None:
            params["tag"] = tag
        return ScenariosList.model_validate(self._get("/api/v1/scenarios", params=params))

    def get_scenario(self, scenario_id: str) -> Scenario:
        return Scenario.model_validate(self._get(f"/api/v1/scenarios/{scenario_id}"))

    def update_scenario(self, scenario_id: str, **kwargs: Any) -> Scenario:
        return Scenario.model_validate(self._patch(f"/api/v1/scenarios/{scenario_id}", kwargs))

    def delete_scenario(self, scenario_id: str) -> None:
        self._delete(f"/api/v1/scenarios/{scenario_id}")

    def generate_scenario(
        self,
        text: str,
        category: str | None = None,
        name: str | None = None,
        tags: list[str] | None = None,
    ) -> Scenario:
        body: dict[str, Any] = {"text": text}
        if category is not None:
            body["category"] = category
        if name is not None:
            body["name"] = name
        if tags is not None:
            body["tags"] = tags
        return Scenario.model_validate(self._post("/api/v1/scenarios/generate", body, timeout=120))

    def generate_scenarios_batch(
        self,
        text: str,
        category: str | None = None,
        tags: list[str] | None = None,
    ) -> ScenariosList:
        body: dict[str, Any] = {"text": text}
        if category is not None:
            body["category"] = category
        if tags is not None:
            body["tags"] = tags
        return ScenariosList.model_validate(self._post("/api/v1/scenarios/generate-batch", body, timeout=300))

    # ── Scenario Runs ─────────────────────────────────────────────────

    def list_scenario_runs(self, test_run_id: str, limit: int | None = None, offset: int | None = None) -> ScenarioRunsList:
        params: dict[str, Any] = {"test_run_id": test_run_id}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        return ScenarioRunsList.model_validate(self._get("/api/v1/scenario-runs", params=params))

    def get_scenario_run(self, scenario_run_id: str) -> ScenarioRun:
        return ScenarioRun.model_validate(self._get(f"/api/v1/scenario-runs/{scenario_run_id}"))

    # ── CSV Export ───────────────────────────────────────────────────

    def export_csv(self, run_id: str) -> str:
        """Export test run results as CSV."""
        response = self._client.get(f"/api/v1/tests/{run_id}/export-csv")
        if not response.is_success:
            _handle_response(response)
        return response.text

    # ── Live Events ───────────────────────────────────────────────────

    def watch(self, run_id: str) -> Iterator[SSEEvent]:
        """Watch a test run via SSE, yielding events as they arrive."""
        headers: dict[str, str] = {"Accept": "text/event-stream"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        with httpx.stream(
            "GET",
            f"{self._base_url}/events",
            params={"run_id": run_id},
            headers=headers,
            timeout=None,
        ) as response:
            yield from _parse_sse_lines(response.iter_lines())

    # ── Health ────────────────────────────────────────────────────────

    def health(self) -> HealthCheck:
        return HealthCheck.model_validate(self._get("/health"))

    # ── Lifecycle ─────────────────────────────────────────────────────

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> Preclinical:
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()



# ---------------------------------------------------------------------------
# Async client
# ---------------------------------------------------------------------------


class AsyncPreclinical:
    """Async Python client for the Preclinical platform.

    Usage::

        from preclinical import AsyncPreclinical

        async with AsyncPreclinical() as client:
            started = await client.start_run(agent_id="...")
            run = await client.get_run(started.id)
            print(f"Status: {run.status}")
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        timeout: float = 30.0,
    ) -> None:
        config = PreclinicalConfig.load(url_override=base_url, api_key_override=api_key)
        self._base_url = config.api_url
        self._api_key = config.api_key
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers=_build_headers(self._api_key),
            timeout=timeout,
        )

    # ── Internal ──────────────────────────────────────────────────────

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return _handle_response(await self._client.get(path, params=params))

    async def _post(self, path: str, body: dict[str, Any] | None = None, timeout: float | None = None) -> Any:
        kwargs: dict[str, Any] = {"json": body or {}}
        if timeout is not None:
            kwargs["timeout"] = timeout
        return _handle_response(await self._client.post(path, **kwargs))

    async def _patch(self, path: str, body: dict[str, Any]) -> Any:
        return _handle_response(await self._client.patch(path, json=body))

    async def _delete(self, path: str) -> Any:
        return _handle_response(await self._client.delete(path))

    # ── Agents ────────────────────────────────────────────────────────

    async def list_agents(self) -> list[Agent]:
        return [Agent.model_validate(a) for a in await self._get("/api/v1/agents")]

    async def get_agent(self, agent_id: str) -> Agent:
        return Agent.model_validate(await self._get(f"/api/v1/agents/{agent_id}"))

    async def create_agent(
        self,
        provider: str,
        name: str,
        description: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> Agent:
        body: dict[str, Any] = {"provider": provider, "name": name}
        if description is not None:
            body["description"] = description
        if config is not None:
            body["config"] = config
        return Agent.model_validate(await self._post("/api/v1/agents", body))

    async def update_agent(
        self,
        agent_id: str,
        name: str | None = None,
        description: str | None = None,
        config: dict[str, Any] | None = None,
    ) -> Agent:
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if description is not None:
            body["description"] = description
        if config is not None:
            body["config"] = config
        return Agent.model_validate(await self._patch(f"/api/v1/agents/{agent_id}", body))

    async def delete_agent(self, agent_id: str) -> None:
        await self._delete(f"/api/v1/agents/{agent_id}")

    # ── Test Runs ─────────────────────────────────────────────────────

    async def start_run(
        self,
        agent_id: str,
        *,
        test_suite_id: str | None = None,
        name: str | None = None,
        max_turns: int | None = None,
        concurrency_limit: int | None = None,
        max_scenarios: int | None = None,
        scenario_ids: list[str] | None = None,
        tags: list[str] | None = None,
        benchmark_mode: bool = False,
        creative_mode: bool = False,
    ) -> StartRunResponse:
        body: dict[str, Any] = {"agent_id": agent_id}
        if test_suite_id is not None:
            body["test_suite_id"] = test_suite_id
        if name is not None:
            body["name"] = name
        if max_turns is not None:
            body["max_turns"] = max_turns
        if concurrency_limit is not None:
            body["concurrency_limit"] = concurrency_limit
        if max_scenarios is not None:
            body["max_scenarios"] = max_scenarios
        if scenario_ids is not None:
            body["scenario_ids"] = scenario_ids
        if tags is not None:
            body["tags"] = tags
        if benchmark_mode:
            body["benchmark_mode"] = True
        if creative_mode:
            body["creative_mode"] = True
        return StartRunResponse.model_validate(await self._post("/start-run", body))

    async def get_run(self, run_id: str) -> TestRun:
        return TestRun.model_validate(await self._get(f"/api/v1/tests/{run_id}"))

    async def list_runs(self, limit: int | None = None, offset: int | None = None, status: str | None = None) -> RunsList:
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        if status is not None:
            params["status"] = status
        return RunsList.model_validate(await self._get("/api/v1/tests", params=params))

    async def cancel_run(self, test_run_id: str) -> dict[str, Any]:
        return await self._post("/cancel-run", {"test_run_id": test_run_id})

    async def delete_run(self, run_id: str) -> None:
        await self._delete(f"/api/v1/tests/{run_id}")

    # ── Scenarios ─────────────────────────────────────────────────────

    async def list_scenarios(self, tag: str | None = None) -> ScenariosList:
        params: dict[str, Any] = {}
        if tag is not None:
            params["tag"] = tag
        return ScenariosList.model_validate(await self._get("/api/v1/scenarios", params=params))

    async def get_scenario(self, scenario_id: str) -> Scenario:
        return Scenario.model_validate(await self._get(f"/api/v1/scenarios/{scenario_id}"))

    async def update_scenario(self, scenario_id: str, **kwargs: Any) -> Scenario:
        return Scenario.model_validate(await self._patch(f"/api/v1/scenarios/{scenario_id}", kwargs))

    async def delete_scenario(self, scenario_id: str) -> None:
        await self._delete(f"/api/v1/scenarios/{scenario_id}")

    async def generate_scenario(
        self,
        text: str,
        category: str | None = None,
        name: str | None = None,
        tags: list[str] | None = None,
    ) -> Scenario:
        body: dict[str, Any] = {"text": text}
        if category is not None:
            body["category"] = category
        if name is not None:
            body["name"] = name
        if tags is not None:
            body["tags"] = tags
        return Scenario.model_validate(await self._post("/api/v1/scenarios/generate", body, timeout=120))

    async def generate_scenarios_batch(
        self,
        text: str,
        category: str | None = None,
        tags: list[str] | None = None,
    ) -> ScenariosList:
        body: dict[str, Any] = {"text": text}
        if category is not None:
            body["category"] = category
        if tags is not None:
            body["tags"] = tags
        return ScenariosList.model_validate(await self._post("/api/v1/scenarios/generate-batch", body, timeout=300))

    # ── Scenario Runs ─────────────────────────────────────────────────

    async def list_scenario_runs(self, test_run_id: str, limit: int | None = None, offset: int | None = None) -> ScenarioRunsList:
        params: dict[str, Any] = {"test_run_id": test_run_id}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        return ScenarioRunsList.model_validate(await self._get("/api/v1/scenario-runs", params=params))

    async def get_scenario_run(self, scenario_run_id: str) -> ScenarioRun:
        return ScenarioRun.model_validate(await self._get(f"/api/v1/scenario-runs/{scenario_run_id}"))

    # ── CSV Export ───────────────────────────────────────────────────

    async def export_csv(self, run_id: str) -> str:
        response = await self._client.get(f"/api/v1/tests/{run_id}/export-csv")
        if not response.is_success:
            _handle_response(response)
        return response.text

    # ── Live Events ───────────────────────────────────────────────────

    async def watch(self, run_id: str) -> AsyncIterator[SSEEvent]:
        """Watch a test run via SSE, yielding events as they arrive."""
        headers: dict[str, str] = {"Accept": "text/event-stream"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"
        async with httpx.AsyncClient().stream(
            "GET",
            f"{self._base_url}/events",
            params={"run_id": run_id},
            headers=headers,
            timeout=None,
        ) as response:
            event_type: str | None = None
            data_lines: list[str] = []
            event_id: str | None = None
            async for line in response.aiter_lines():
                if line.startswith("event:"):
                    event_type = line[len("event:"):].strip()
                elif line.startswith("data:"):
                    data_lines.append(line[len("data:"):].strip())
                elif line.startswith("id:"):
                    event_id = line[len("id:"):].strip()
                elif line.startswith(":"):
                    continue
                elif line == "":
                    if data_lines:
                        raw_data = "\n".join(data_lines)
                        try:
                            parsed = json.loads(raw_data)
                        except json.JSONDecodeError:
                            parsed = {"raw": raw_data}
                        yield SSEEvent(event=event_type, data=parsed, id=event_id)
                    event_type = None
                    data_lines = []
                    event_id = None

    # ── Health ────────────────────────────────────────────────────────

    async def health(self) -> HealthCheck:
        return HealthCheck.model_validate(await self._get("/health"))

    # ── Lifecycle ─────────────────────────────────────────────────────

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> AsyncPreclinical:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
