"""CLI commands for viewing scenario run results."""

from __future__ import annotations

from typing import Annotated, Optional

import typer

from preclinical.cli.formatters import (
    error_console,
    print_json,
    print_scenario_run_detail,
    print_scenario_runs_table,
)
from preclinical.exceptions import PreclinicalAPIError

app = typer.Typer(name="results", help="View scenario run results.")


@app.command("list")
def list_results(
    run_id: Annotated[str, typer.Argument(help="Test run ID to list results for")],
    limit: Annotated[Optional[int], typer.Option("--limit", "-l", help="Max results")] = None,
    offset: Annotated[Optional[int], typer.Option("--offset", "-o", help="Offset")] = None,
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """List scenario run results for a test run."""
    from preclinical.cli.app import get_client
    client = get_client()
    try:
        result = client.list_scenario_runs(test_run_id=run_id, limit=limit, offset=offset)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(result)
    else:
        print_scenario_runs_table(result.results, result.total)


@app.command("get")
def get_result(
    scenario_run_id: Annotated[str, typer.Argument(help="Scenario run ID")],
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Get detailed results for a single scenario run."""
    from preclinical.cli.app import get_client
    client = get_client()
    try:
        sr = client.get_scenario_run(scenario_run_id)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(sr)
    else:
        print_scenario_run_detail(sr)
