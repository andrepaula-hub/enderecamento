from __future__ import annotations

import os
from pathlib import Path


def _path(env_var: str, default: str) -> Path:
    return Path(os.environ.get(env_var, default))


def _str(env_var: str, default: str = "") -> str:
    return os.environ.get(env_var, default)


def _int(env_var: str, default: int) -> int:
    try:
        return int(os.environ.get(env_var, default))
    except (TypeError, ValueError):
        return default


# Google OAuth
GOOGLE_CLIENT_SECRET_PATH: Path = _path("GOOGLE_CLIENT_SECRET_PATH", ".credentials/client_secret.json")
GOOGLE_TOKEN_PATH: Path = _path("GOOGLE_TOKEN_PATH", ".credentials/token.json")

# Metabase
METABASE_URL: str = _str("METABASE_URL", "")
METABASE_USERNAME: str = _str("METABASE_USERNAME", "")
METABASE_PASSWORD: str = _str("METABASE_PASSWORD", "")

# App
APP_PORT: int = _int("APP_PORT", 8000)
JOB_TIMEOUT_SECONDS: int = _int("JOB_TIMEOUT_SECONDS", 120)
SQLITE_PATH: Path = _path("SQLITE_PATH", ".credentials/app.db")
OUTPUTS_PATH: Path = _path("OUTPUTS_PATH", "outputs")
LOG_LEVEL: str = _str("LOG_LEVEL", "info").upper()
