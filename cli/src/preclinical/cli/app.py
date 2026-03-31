"""Root Typer application for the Preclinical CLI."""

from __future__ import annotations

from typing import Annotated, Optional

import typer

import preclinical
from preclinical.cli.formatters import console, error_console, print_health, print_json
from preclinical.client import Preclinical
from preclinical.exceptions import PreclinicalAPIError

# ── Global state ──────────────────────────────────────────────────────

_client: Preclinical | None = None
_url_override: str | None = None
_key_override: str | None = None


def get_client() -> Preclinical:
    """Return the lazily-initialised client singleton."""
    global _client
    if _client is None:
        _client = Preclinical(base_url=_url_override, api_key=_key_override)
    return _client


# ── Root app ──────────────────────────────────────────────────────────

app = typer.Typer(
    name="preclinical",
    help="CLI for the Preclinical healthcare AI agent testing platform.",
    no_args_is_help=True,
)


def _version_callback(value: bool) -> None:
    if value:
        console.print(f"preclinical {preclinical.__version__}")
        raise typer.Exit()


@app.callback()
def main(
    url: Annotated[Optional[str], typer.Option("--url", envvar="PRECLINICAL_API_URL", help="API base URL")] = None,
    api_key: Annotated[Optional[str], typer.Option("--api-key", envvar="PRECLINICAL_API_KEY", help="API key")] = None,
    version: Annotated[Optional[bool], typer.Option("--version", "-V", callback=_version_callback, is_eager=True, help="Show version")] = None,
) -> None:
    """Preclinical CLI -- test healthcare AI agents with adversarial scenarios."""
    global _url_override, _key_override
    _url_override = url
    _key_override = api_key


# ── Sub-commands ──────────────────────────────────────────────────────

from preclinical.cli.agents import app as agents_app  # noqa: E402
from preclinical.cli.results import app as results_app  # noqa: E402
from preclinical.cli.runs import app as runs_app  # noqa: E402
from preclinical.cli.scenarios import app as scenarios_app  # noqa: E402

app.add_typer(agents_app)
app.add_typer(runs_app)
app.add_typer(scenarios_app)
app.add_typer(results_app)


# ── Top-level run command (convenience) ───────────────────────────────

@app.command("run")
def start_run(
    agent_id: Annotated[str, typer.Argument(help="Agent ID to run tests against")],
    name: Annotated[Optional[str], typer.Option("--name", "-n", help="Run name")] = None,
    max_turns: Annotated[Optional[int], typer.Option("--max-turns", help="Maximum conversation turns")] = None,
    tags: Annotated[Optional[str], typer.Option("--tags", help="Comma-separated scenario tags to filter")] = None,
    scenario_ids: Annotated[Optional[str], typer.Option("--scenario-ids", help="Comma-separated scenario IDs")] = None,
    concurrency: Annotated[Optional[int], typer.Option("--concurrency", help="Concurrency limit")] = None,
    max_scenarios: Annotated[Optional[int], typer.Option("--max-scenarios", help="Max scenarios to run")] = None,
    benchmark: Annotated[bool, typer.Option("--benchmark", help="Enable benchmark mode")] = False,
    creative: Annotated[bool, typer.Option("--creative", help="Use adversarial LLM-driven attack strategies")] = False,
    watch: Annotated[bool, typer.Option("--watch", "-w", help="Watch run progress via SSE")] = False,
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Start a test run against an agent."""
    client = get_client()

    tags_list = [t.strip() for t in tags.split(",")] if tags else None
    scenario_ids_list = [s.strip() for s in scenario_ids.split(",")] if scenario_ids else None

    try:
        result = client.start_run(
            agent_id=agent_id,
            name=name,
            max_turns=max_turns,
            tags=tags_list,
            scenario_ids=scenario_ids_list,
            concurrency_limit=concurrency,
            max_scenarios=max_scenarios,
            benchmark_mode=benchmark,
            creative_mode=creative,
        )
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(result)
    else:
        console.print(f"[green]Started run:[/green] {result.test_run_id}")
        console.print(f"  [dim]UUID:[/dim]              {result.id}")
        console.print(f"  [dim]Status:[/dim]            {result.status}")
        console.print(f"  [dim]Total scenarios:[/dim]   {result.total_scenarios}")
        console.print(f"  [dim]Launched:[/dim]          {result.scenarios_launched}")

    if watch and not output_json:
        console.print(f"\n[dim]Watching run {result.id}... (Ctrl+C to stop)[/dim]\n")
        try:
            for event in client.watch(result.id):
                event_type = event.event or event.data.get("type", "unknown")
                console.print(f"  [cyan]{event_type}[/cyan]", end="")
                data = event.data
                interesting = {k: v for k, v in data.items() if k in (
                    "status", "passed", "scenario_name", "pass_rate",
                    "passed_count", "failed_count", "error_count",
                )}
                if interesting:
                    parts = [f"{k}={v}" for k, v in interesting.items()]
                    console.print(f"  {', '.join(parts)}")
                else:
                    console.print()
        except KeyboardInterrupt:
            console.print(f"\n[dim]Stopped watching.[/dim]")


# ── Health command ────────────────────────────────────────────────────

@app.command("health")
def health(
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Check platform health status."""
    client = get_client()
    try:
        result = client.health()
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)
    except Exception as e:
        error_console.print(f"[red]Error:[/red] Could not reach server: {e}")
        raise typer.Exit(1)

    if output_json:
        print_json(result)
    else:
        print_health(result)
