"""Preclinical — test healthcare AI agents with adversarial scenarios."""

__version__ = "0.3.0"

from preclinical.client import AsyncPreclinical, Preclinical
from preclinical.exceptions import (
    APIValidationError,
    NotFoundError,
    PreclinicalAPIError,
    PreclinicalError,
)
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

__all__ = [
    "Preclinical",
    "AsyncPreclinical",
    "PreclinicalError",
    "PreclinicalAPIError",
    "NotFoundError",
    "APIValidationError",
    "Agent",
    "TestRun",
    "ScenarioRun",
    "Scenario",
    "StartRunResponse",
    "RunsList",
    "ScenarioRunsList",
    "ScenariosList",
    "HealthCheck",
]
