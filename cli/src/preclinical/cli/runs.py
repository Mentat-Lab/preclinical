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
    print_sse_event,
)
from preclinical.exceptions import PreclinicalAPIError

app = typer.Typer(name="runs", help="Manage test runs.")


@app.command("list")
def list_runs(
    limit: Annotated[Optional[int], typer.Option("--limit", "-l", help="Max results")] = None,
    offset: Annotated[Optional[int], typer.Option("--offset", "-o", help="Offset")] = None,
    status: Annotated[Optional[str], typer.Option("--status", "-s", help="Filter by status")] = None,
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """List test runs."""
    from preclinical.cli.app import get_client
    client = get_client()
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
    from preclinical.cli.app import get_client
    client = get_client()
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
    from preclinical.cli.app import get_client
    client = get_client()
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

    from preclinical.cli.app import get_client
    client = get_client()
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
    from preclinical.cli.app import get_client
    client = get_client()
    console.print(f"[dim]Watching run {run_id}... (Ctrl+C to stop)[/dim]\n")

    try:
        for event in client.watch(run_id):
            print_sse_event(event, json_mode=output_json)
    except KeyboardInterrupt:
        console.print(f"\n[dim]Stopped watching.[/dim]")
