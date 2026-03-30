"""CLI commands for managing test runs."""

from __future__ import annotations

from typing import Annotated, Optional

import typer

from preclinical.cli.formatters import (
    console,
    error_console,
    print_json,
    print_run_detail,
    print_runs_table,
)
from preclinical.exceptions import PreclinicalAPIError

app = typer.Typer(name="runs", help="Manage test runs.")


def _get_client() -> "Preclinical":
    from preclinical.cli.app import get_client

    return get_client()


@app.command("list")
def list_runs(
    limit: Annotated[Optional[int], typer.Option("--limit", "-l", help="Max results")] = None,
    offset: Annotated[Optional[int], typer.Option("--offset", "-o", help="Offset")] = None,
    status: Annotated[Optional[str], typer.Option("--status", "-s", help="Filter by status")] = None,
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """List test runs."""
    client = _get_client()
    try:
        result = client.list_runs(limit=limit, offset=offset, status=status)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(result)
    else:
        print_runs_table(result.runs, result.total)


@app.command("get")
def get_run(
    run_id: Annotated[str, typer.Argument(help="Test run ID (UUID or human-readable)")],
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Get details of a specific test run."""
    client = _get_client()
    try:
        run = client.get_run(run_id)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(run)
    else:
        print_run_detail(run)


@app.command("cancel")
def cancel_run(
    run_id: Annotated[str, typer.Argument(help="Test run ID (UUID)")],
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Cancel a running test run."""
    client = _get_client()
    try:
        result = client.cancel_run(run_id)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(result)
    else:
        console.print(f"[yellow]Canceled run {run_id}[/yellow]")
        if "canceled_scenarios" in result:
            console.print(f"  Canceled {result['canceled_scenarios']} scenario(s)")


@app.command("delete")
def delete_run(
    run_id: Annotated[str, typer.Argument(help="Test run ID")],
    force: Annotated[bool, typer.Option("--force", "-f", help="Skip confirmation")] = False,
) -> None:
    """Delete a test run."""
    if not force:
        confirm = typer.confirm(f"Delete test run {run_id}?")
        if not confirm:
            raise typer.Abort()

    client = _get_client()
    try:
        client.delete_run(run_id)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    console.print(f"[green]Deleted test run {run_id}[/green]")


@app.command("watch")
def watch_run(
    run_id: Annotated[str, typer.Argument(help="Test run ID (UUID)")],
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Watch a test run via live SSE stream."""
    client = _get_client()
    console.print(f"[dim]Watching run {run_id}... (Ctrl+C to stop)[/dim]\n")

    try:
        for event in client.watch(run_id):
            if output_json:
                print_json(event)
            else:
                event_type = event.event or event.data.get("type", "unknown")
                console.print(f"  [{_event_color(event_type)}]{event_type}[/{_event_color(event_type)}]", end="")

                # Print relevant fields from event data
                data = event.data
                interesting_keys = [
                    "status", "passed", "scenario_name", "pass_rate",
                    "passed_count", "failed_count", "error_count",
                    "canceled_scenarios", "reason",
                ]
                details = {k: v for k, v in data.items() if k in interesting_keys}
                if details:
                    parts = [f"{k}={v}" for k, v in details.items()]
                    console.print(f"  {', '.join(parts)}")
                else:
                    console.print()
    except KeyboardInterrupt:
        console.print(f"\n[dim]Stopped watching.[/dim]")


def _event_color(event_type: str) -> str:
    """Return a color for a given event type."""
    if "complete" in event_type or "passed" in event_type:
        return "green"
    if "failed" in event_type or "error" in event_type:
        return "red"
    if "cancel" in event_type:
        return "yellow"
    if "started" in event_type or "running" in event_type:
        return "cyan"
    return "white"
