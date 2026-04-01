"""CLI commands for managing scenarios."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated, Optional

import typer

from preclinical.cli.formatters import (
    console,
    error_console,
    print_json,
    print_scenario_detail,
    print_scenarios_table,
)
from preclinical.exceptions import PreclinicalAPIError

app = typer.Typer(name="scenarios", help="Manage test scenarios.")


@app.command("list")
def list_scenarios(
    tag: Annotated[Optional[str], typer.Option("--tag", "-t", help="Filter by tag")] = None,
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """List active, approved scenarios."""
    from preclinical.cli.app import get_client
    client = get_client()
    try:
        result = client.list_scenarios(tag=tag)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(result)
    else:
        print_scenarios_table(result.scenarios, result.total)


@app.command("get")
def get_scenario(
    scenario_id: Annotated[str, typer.Argument(help="Scenario ID")],
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Get details of a specific scenario."""
    from preclinical.cli.app import get_client
    client = get_client()
    try:
        scenario = client.get_scenario(scenario_id)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(scenario)
    else:
        print_scenario_detail(scenario)


@app.command("generate")
def generate_scenario(
    text: Annotated[str, typer.Option("--text", "-t", help="Clinical text to generate scenario from")],
    category: Annotated[Optional[str], typer.Option("--category", "-c", help="Scenario category")] = None,
    name: Annotated[Optional[str], typer.Option("--name", "-n", help="Scenario name")] = None,
    tags: Annotated[Optional[str], typer.Option("--tags", help="Comma-separated tags")] = None,
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Generate a single scenario from clinical text."""
    from preclinical.cli.app import get_client
    client = get_client()
    tags_list = [t.strip() for t in tags.split(",")] if tags else None

    try:
        scenario = client.generate_scenario(
            text=text,
            category=category,
            name=name,
            tags=tags_list,
        )
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(scenario)
    else:
        console.print(f"[green]Generated scenario:[/green] {scenario.name}")
        print_scenario_detail(scenario)


@app.command("generate-batch")
def generate_batch(
    file: Annotated[Optional[Path], typer.Option("--file", "-f", help="File containing clinical text")] = None,
    text: Annotated[Optional[str], typer.Option("--text", "-t", help="Clinical text (alternative to --file)")] = None,
    category: Annotated[Optional[str], typer.Option("--category", "-c", help="Scenario category")] = None,
    tags: Annotated[Optional[str], typer.Option("--tags", help="Comma-separated tags")] = None,
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Generate multiple scenarios from a clinical document."""
    if file and text:
        error_console.print("[red]Error:[/red] Provide either --file or --text, not both")
        raise typer.Exit(1)

    if file:
        if not file.exists():
            error_console.print(f"[red]Error:[/red] File not found: {file}")
            raise typer.Exit(1)
        clinical_text = file.read_text(encoding="utf-8")
    elif text:
        clinical_text = text
    else:
        error_console.print("[red]Error:[/red] Provide either --file or --text")
        raise typer.Exit(1)

    from preclinical.cli.app import get_client
    client = get_client()
    tags_list = [t.strip() for t in tags.split(",")] if tags else None

    try:
        result = client.generate_scenarios_batch(
            text=clinical_text,
            category=category,
            tags=tags_list,
        )
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(result)
    else:
        console.print(f"[green]Generated {result.total} scenario(s)[/green]")
        print_scenarios_table(result.scenarios, result.total)


@app.command("update")
def update_scenario(
    scenario_id: Annotated[str, typer.Argument(help="Scenario ID")],
    name: Annotated[Optional[str], typer.Option("--name", "-n", help="New name")] = None,
    category: Annotated[Optional[str], typer.Option("--category", "-c", help="New category")] = None,
    tags: Annotated[Optional[str], typer.Option("--tags", help="Comma-separated tags")] = None,
    priority: Annotated[Optional[int], typer.Option("--priority", help="Priority")] = None,
    approved: Annotated[Optional[bool], typer.Option("--approved/--unapproved", help="Approval status")] = None,
    active: Annotated[Optional[bool], typer.Option("--active/--inactive", help="Active status")] = None,
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Update a scenario."""
    from preclinical.cli.app import get_client
    client = get_client()
    kwargs: dict = {}
    if name is not None:
        kwargs["name"] = name
    if category is not None:
        kwargs["category"] = category
    if tags is not None:
        kwargs["tags"] = [t.strip() for t in tags.split(",")]
    if priority is not None:
        kwargs["priority"] = priority
    if approved is not None:
        kwargs["approved"] = approved
    if active is not None:
        kwargs["is_active"] = active

    if not kwargs:
        error_console.print("[yellow]Warning:[/yellow] No updates specified.")
        raise typer.Exit(0)

    try:
        scenario = client.update_scenario(scenario_id, **kwargs)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(scenario)
    else:
        console.print(f"[green]Updated scenario:[/green] {scenario.name}")
        print_scenario_detail(scenario)


@app.command("delete")
def delete_scenario(
    scenario_id: Annotated[str, typer.Argument(help="Scenario ID")],
    force: Annotated[bool, typer.Option("--force", "-f", help="Skip confirmation")] = False,
) -> None:
    """Delete a scenario (marks as inactive)."""
    if not force:
        confirm = typer.confirm(f"Delete scenario {scenario_id}?")
        if not confirm:
            raise typer.Abort()

    from preclinical.cli.app import get_client
    client = get_client()
    try:
        client.delete_scenario(scenario_id)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    console.print(f"[green]Deleted scenario {scenario_id}[/green]")
