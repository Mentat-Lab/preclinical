"""Configuration resolution for the Preclinical SDK and CLI."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    import tomllib
except ImportError:
    import tomli as tomllib  # type: ignore[no-redef]


CONFIG_DIR = Path.home() / ".preclinical"
CONFIG_FILE = CONFIG_DIR / "config.toml"

DEFAULT_API_URL = "http://localhost:3000"


@dataclass
class PreclinicalConfig:
    """Resolved configuration for the Preclinical client."""

    api_url: str = DEFAULT_API_URL
    api_key: str | None = None

    @classmethod
    def load(cls, url_override: str | None = None, api_key_override: str | None = None) -> PreclinicalConfig:
        """Load configuration with the following precedence (highest to lowest):

        1. Explicit overrides (CLI flags)
        2. Environment variables
        3. Config file (~/.preclinical/config.toml)
        4. Defaults
        """
        file_config = _load_config_file()

        api_url = (
            url_override
            or os.environ.get("PRECLINICAL_API_URL")
            or file_config.get("api_url")
            or DEFAULT_API_URL
        )

        api_key = (
            api_key_override
            or os.environ.get("PRECLINICAL_API_KEY")
            or file_config.get("api_key")
        )

        return cls(api_url=api_url.rstrip("/"), api_key=api_key)


def _load_config_file() -> dict[str, Any]:
    """Read ~/.preclinical/config.toml if it exists."""
    if not CONFIG_FILE.exists():
        return {}
    try:
        with open(CONFIG_FILE, "rb") as f:
            return tomllib.load(f)
    except Exception:
        return {}
