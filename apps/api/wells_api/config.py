"""The API's settings, read from the environment once and checked before the app starts.

Every variable is optional, and an empty value counts as unset.
`.env.example` copies straight into a shell or a compose file, so `WELLS_DATA_DIR=` must fall back to the
default instead of pointing the API at its working directory.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ValidationError, field_validator

#: data/demo in this checkout, three levels above this package.
DEFAULT_DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "demo"

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class SettingsError(ValueError):
    """An environment variable is set to a value the API cannot use."""


class Settings(BaseModel, frozen=True):
    data_dir: Path = DEFAULT_DATA_DIR
    log_level: LogLevel = "INFO"

    @field_validator("log_level", mode="before")
    @classmethod
    def _upper(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value


#: Setting name to the environment variable it comes from.
ENV = {"data_dir": "WELLS_DATA_DIR", "log_level": "WELLS_LOG_LEVEL"}


def load(environ: Mapping[str, str] | None = None) -> Settings:
    """Reads the settings from `environ`, os.environ by default, skipping empty and blank values."""
    environ = os.environ if environ is None else environ
    given = {key: environ[var].strip() for key, var in ENV.items() if environ.get(var, "").strip()}
    try:
        return Settings(**given)
    except ValidationError as exc:
        problems = "; ".join(f"{ENV[str(e['loc'][0])]}: {e['msg']}" for e in exc.errors())
        raise SettingsError(problems) from None
