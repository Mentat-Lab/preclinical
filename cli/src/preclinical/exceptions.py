"""Exception hierarchy for the Preclinical SDK."""

from __future__ import annotations

from typing import Any


class PreclinicalError(Exception):
    """Base exception for all Preclinical SDK errors."""


class PreclinicalAPIError(PreclinicalError):
    """Raised when the API returns a non-2xx response."""

    def __init__(
        self,
        status_code: int,
        message: str,
        response: dict[str, Any] | None = None,
    ) -> None:
        self.status_code = status_code
        self.message = message
        self.response = response or {}
        super().__init__(f"HTTP {status_code}: {message}")


class NotFoundError(PreclinicalAPIError):
    """Raised when the API returns 404."""

    def __init__(self, message: str = "Resource not found", response: dict[str, Any] | None = None) -> None:
        super().__init__(status_code=404, message=message, response=response)


class APIValidationError(PreclinicalAPIError):
    """Raised when the API returns 400 (bad request / validation failure)."""

    def __init__(self, message: str = "Validation error", response: dict[str, Any] | None = None) -> None:
        super().__init__(status_code=400, message=message, response=response)
