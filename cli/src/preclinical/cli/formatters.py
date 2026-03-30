"""Rich-based formatters for CLI output."""

from __future__ import annotations

import json
from typing import Any

from rich.console import Console
from rich.table import Table
from rich.text import Text

console = Console()
error_console = Console(stderr=True)

STATUS_COLORS: dict[str, str] = {
    "passed": "green",
    "completed": "green",
    "ok": "green",
    "running": "yellow",
    "grading": "yellow",
    "pending": "dim",
    "scheduled": "dim",
    "failed": "red",
    "error": "red",
    "canceled": "red",
    "warning": "yellow",
}


def status_text(status: str) -> Text:
    """Return a Rich Text with color-coded status."""
    color = STATUS_COLORS.get(status.lower(), "white")
    return Text(status, style=color)


def print_json(data: Any) -> None:
    """Print raw JSON to stdout."""
    if hasattr(data, "model_dump"):
        data = data.model_dump(mode="json")
    elif isinstance(data, list):
        data = [item.model_dump(mode="json") if hasattr(item, "model_dump") else item for item in data]
    console.print_json(json.dumps(data, indent=2, default=str))


def print_agents_table(agents: list[Any]) -> None:
    """Print a table of agents."""
    table = Table(title="Agents", show_lines=False)
    table.add_column("ID", style="dim", max_width=36)
    table.add_column("Name", style="bold")
    table.add_column("Provider")
    table.add_column("Description", max_width=40)
    table.add_column("Active")

    for agent in agents:
        active = Text("yes", style="green") if agent.is_active else Text("no", style="red")
        table.add_row(
            agent.id,
            agent.name,
            agent.provider,
            agent.description or "-",
            active,
        )

    console.print(table)


def print_agent_detail(agent: Any) -> None:
    """Print detailed agent information."""
    console.print(f"\n[bold]Agent:[/bold] {agent.name}")
    console.print(f"  [dim]ID:[/dim]          {agent.id}")
    console.print(f"  [dim]Provider:[/dim]    {agent.provider}")
    console.print(f"  [dim]Description:[/dim] {agent.description or '-'}")
    console.print(f"  [dim]Active:[/dim]      {agent.is_active}")
    if agent.config:
        console.print(f"  [dim]Config:[/dim]")
        for key, value in agent.config.items():
            console.print(f"    {key}: {value}")
    console.print()


def print_runs_table(runs: list[Any], total: int) -> None:
    """Print a table of test runs."""
    table = Table(title=f"Test Runs ({total} total)", show_lines=False)
    table.add_column("ID", style="dim", max_width=36)
    table.add_column("Run ID", style="bold", max_width=24)
    table.add_column("Agent", max_width=20)
    table.add_column("Status")
    table.add_column("Pass Rate", justify="right")
    table.add_column("P/F/E", justify="right")
    table.add_column("Created")

    for run in runs:
        pass_rate = f"{run.pass_rate:.0f}%" if run.pass_rate is not None else "-"
        pfe = (
            f"{run.passed_count or 0}/{run.failed_count or 0}/{run.error_count or 0}"
            if run.passed_count is not None
            else "-"
        )
        created = run.created_at.strftime("%Y-%m-%d %H:%M") if run.created_at else "-"

        table.add_row(
            run.id,
            run.test_run_id or "-",
            run.agent_name or "-",
            status_text(run.status),
            pass_rate,
            pfe,
            created,
        )

    console.print(table)


def print_run_detail(run: Any) -> None:
    """Print detailed test run information."""
    console.print(f"\n[bold]Test Run:[/bold] {run.test_run_id or run.id}")
    console.print(f"  [dim]UUID:[/dim]        {run.id}")
    if run.name:
        console.print(f"  [dim]Name:[/dim]        {run.name}")
    console.print(f"  [dim]Agent:[/dim]       {run.agent_name or '-'} ({run.agent_type or '-'})")
    console.print(f"  [dim]Status:[/dim]      ", end="")
    console.print(status_text(run.status))
    console.print(f"  [dim]Scenarios:[/dim]   {run.total_scenarios}")
    if run.passed_count is not None:
        console.print(f"  [dim]Passed:[/dim]      [green]{run.passed_count}[/green]")
        console.print(f"  [dim]Failed:[/dim]      [red]{run.failed_count or 0}[/red]")
        console.print(f"  [dim]Errors:[/dim]      [red]{run.error_count or 0}[/red]")
    if run.pass_rate is not None:
        console.print(f"  [dim]Pass Rate:[/dim]   {run.pass_rate:.1f}%")
    console.print(f"  [dim]Benchmark:[/dim]   {run.benchmark_mode}")
    if run.started_at:
        console.print(f"  [dim]Started:[/dim]     {run.started_at}")
    if run.completed_at:
        console.print(f"  [dim]Completed:[/dim]   {run.completed_at}")
    console.print()


def print_scenario_runs_table(results: list[Any], total: int) -> None:
    """Print a table of scenario run results."""
    table = Table(title=f"Scenario Results ({total} total)", show_lines=False)
    table.add_column("ID", style="dim", max_width=36)
    table.add_column("Scenario", style="bold", max_width=30)
    table.add_column("Status")
    table.add_column("Passed")
    table.add_column("Duration", justify="right")
    table.add_column("Summary", max_width=40)

    for sr in results:
        passed_display: Text | str
        if sr.passed is True:
            passed_display = Text("PASS", style="green bold")
        elif sr.passed is False:
            passed_display = Text("FAIL", style="red bold")
        else:
            passed_display = "-"

        duration = f"{sr.duration_ms}ms" if sr.duration_ms else "-"
        summary = (sr.grade_summary or "")[:40] if sr.grade_summary else "-"

        table.add_row(
            sr.id,
            sr.scenario_name or sr.scenario_id or "-",
            status_text(sr.status),
            passed_display,
            duration,
            summary,
        )

    console.print(table)


def print_scenario_run_detail(sr: Any) -> None:
    """Print detailed scenario run information."""
    console.print(f"\n[bold]Scenario Run:[/bold] {sr.id}")
    console.print(f"  [dim]Scenario:[/dim]    {sr.scenario_name or sr.scenario_id or '-'}")
    console.print(f"  [dim]Test Run:[/dim]    {sr.test_run_id}")
    console.print(f"  [dim]Status:[/dim]      ", end="")
    console.print(status_text(sr.status))

    if sr.passed is True:
        console.print(f"  [dim]Result:[/dim]      [green bold]PASS[/green bold]")
    elif sr.passed is False:
        console.print(f"  [dim]Result:[/dim]      [red bold]FAIL[/red bold]")

    if sr.duration_ms:
        console.print(f"  [dim]Duration:[/dim]    {sr.duration_ms}ms")
    if sr.grade_summary:
        console.print(f"  [dim]Summary:[/dim]     {sr.grade_summary}")
    if sr.error_message:
        console.print(f"  [dim]Error:[/dim]       [red]{sr.error_message}[/red]")

    if sr.criteria_results:
        console.print(f"\n  [bold]Criteria Results:[/bold]")
        for cr in sr.criteria_results:
            met = cr.get("met") or cr.get("passed")
            icon = "[green]PASS[/green]" if met else "[red]FAIL[/red]"
            name = cr.get("criterion") or cr.get("name") or "?"
            console.print(f"    {icon}  {name}")
            if cr.get("evidence"):
                console.print(f"         [dim]{cr['evidence']}[/dim]")

    if sr.transcript:
        console.print(f"\n  [bold]Transcript ({len(sr.transcript)} turns):[/bold]")
        for i, turn in enumerate(sr.transcript):
            role = turn.get("role", "?")
            content = turn.get("content", "")
            style = "cyan" if role == "assistant" else "white"
            console.print(f"    [{style}]{role}:[/{style}] {content[:200]}")

    console.print()


def print_scenarios_table(scenarios: list[Any], total: int) -> None:
    """Print a table of scenarios."""
    table = Table(title=f"Scenarios ({total} total)", show_lines=False)
    table.add_column("ID", style="dim", max_width=36)
    table.add_column("Name", style="bold", max_width=30)
    table.add_column("Category", max_width=15)
    table.add_column("Type", max_width=12)
    table.add_column("Tags")
    table.add_column("Priority", justify="right")

    for s in scenarios:
        tags_str = ", ".join(s.tags) if s.tags else "-"
        table.add_row(
            s.scenario_id,
            s.name,
            s.category or "-",
            s.scenario_type or "-",
            tags_str,
            str(s.priority) if s.priority is not None else "-",
        )

    console.print(table)


def print_scenario_detail(scenario: Any) -> None:
    """Print detailed scenario information."""
    console.print(f"\n[bold]Scenario:[/bold] {scenario.name}")
    console.print(f"  [dim]ID:[/dim]         {scenario.scenario_id}")
    console.print(f"  [dim]Category:[/dim]   {scenario.category or '-'}")
    console.print(f"  [dim]Type:[/dim]       {scenario.scenario_type or '-'}")
    console.print(f"  [dim]Active:[/dim]     {scenario.is_active}")
    console.print(f"  [dim]Approved:[/dim]   {scenario.approved}")
    console.print(f"  [dim]Priority:[/dim]   {scenario.priority or '-'}")
    console.print(f"  [dim]Tags:[/dim]       {', '.join(scenario.tags) if scenario.tags else '-'}")

    if scenario.content:
        console.print(f"\n  [bold]Content:[/bold]")
        for key, value in scenario.content.items():
            val_str = str(value)
            if len(val_str) > 100:
                val_str = val_str[:100] + "..."
            console.print(f"    {key}: {val_str}")

    if scenario.rubric_criteria:
        console.print(f"\n  [bold]Rubric Criteria ({len(scenario.rubric_criteria)}):[/bold]")
        for cr in scenario.rubric_criteria:
            name = cr.get("criterion") or cr.get("name") or "?"
            weight = cr.get("weight", "")
            weight_str = f" (weight: {weight})" if weight else ""
            console.print(f"    - {name}{weight_str}")

    console.print()


def print_health(health: Any) -> None:
    """Print health check results."""
    console.print(f"\n[bold]Platform Health:[/bold] ", end="")
    console.print(status_text(health.status))
    if health.timestamp:
        console.print(f"  [dim]Timestamp:[/dim] {health.timestamp}")

    if health.checks:
        console.print(f"\n  [bold]Checks:[/bold]")
        for name, check in health.checks.items():
            console.print(f"    ", end="")
            console.print(status_text(check.status), end="")
            console.print(f"  {name}: {check.detail}")

    if health.setup:
        console.print(f"\n  [bold]Setup:[/bold]")
        for key, value in health.setup.items():
            console.print(f"    {key}: {value}")

    console.print()
