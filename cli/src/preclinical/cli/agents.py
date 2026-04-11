"""CLI commands for managing agents."""

from __future__ import annotations

import json
from typing import Annotated, Optional

import typer

from preclinical.cli.formatters import (
    console,
    error_console,
    print_agent_detail,
    print_agents_table,
    print_json,
)
from preclinical.exceptions import PreclinicalAPIError

app = typer.Typer(name="agents", help="Manage agents.")


@app.command("list")
def list_agents(
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """List all active agents."""
    from preclinical.cli.app import get_client
    client = get_client()
    try:
        agents = client.list_agents()
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(agents)
    else:
        print_agents_table(agents)


@app.command("get")
def get_agent(
    agent_id: Annotated[str, typer.Argument(help="Agent ID")],
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Get details of a specific agent."""
    from preclinical.cli.app import get_client
    client = get_client()
    try:
        agent = client.get_agent(agent_id)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(agent)
    else:
        print_agent_detail(agent)


@app.command("create")
def create_agent(
    provider: Annotated[str, typer.Option("--provider", "-p", help="Provider type (openai, vapi, browser, livekit, pipecat, elevenlabs)")],
    name: Annotated[str, typer.Option("--name", "-n", help="Agent name")],
    description: Annotated[Optional[str], typer.Option("--description", "-d", help="Agent description")] = None,
    config: Annotated[Optional[str], typer.Option("--config", "-c", help="Agent config as JSON string")] = None,
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Create a new agent."""
    from preclinical.cli.app import get_client
    client = get_client()
    config_dict = None
    if config:
        try:
            config_dict = json.loads(config)
        except json.JSONDecodeError:
            error_console.print("[red]Error:[/red] --config must be valid JSON")
            raise typer.Exit(1)

    try:
        agent = client.create_agent(
            provider=provider,
            name=name,
            description=description,
            config=config_dict,
        )
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(agent)
    else:
        console.print(f"[green]Created agent:[/green] {agent.name} ({agent.id})")
        print_agent_detail(agent)


@app.command("update")
def update_agent(
    agent_id: Annotated[str, typer.Argument(help="Agent ID")],
    name: Annotated[Optional[str], typer.Option("--name", "-n", help="New name")] = None,
    description: Annotated[Optional[str], typer.Option("--description", "-d", help="New description")] = None,
    config: Annotated[Optional[str], typer.Option("--config", "-c", help="Config update as JSON string")] = None,
    output_json: Annotated[bool, typer.Option("--json", help="Output raw JSON")] = False,
) -> None:
    """Update an existing agent."""
    from preclinical.cli.app import get_client
    client = get_client()
    config_dict = None
    if config:
        try:
            config_dict = json.loads(config)
        except json.JSONDecodeError:
            error_console.print("[red]Error:[/red] --config must be valid JSON")
            raise typer.Exit(1)

    if not any([name, description, config_dict]):
        error_console.print("[yellow]Warning:[/yellow] No updates specified.")
        raise typer.Exit(0)

    try:
        agent = client.update_agent(
            agent_id=agent_id,
            name=name,
            description=description,
            config=config_dict,
        )
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    if output_json:
        print_json(agent)
    else:
        console.print(f"[green]Updated agent:[/green] {agent.name}")
        print_agent_detail(agent)


@app.command("delete")
def delete_agent(
    agent_id: Annotated[str, typer.Argument(help="Agent ID")],
    force: Annotated[bool, typer.Option("--force", "-f", help="Skip confirmation")] = False,
) -> None:
    """Delete an agent."""
    if not force:
        confirm = typer.confirm(f"Delete agent {agent_id}?")
        if not confirm:
            raise typer.Abort()

    from preclinical.cli.app import get_client
    client = get_client()
    try:
        client.delete_agent(agent_id)
    except PreclinicalAPIError as e:
        error_console.print(f"[red]Error:[/red] {e.message}")
        raise typer.Exit(1)

    console.print(f"[green]Deleted agent {agent_id}[/green]")
