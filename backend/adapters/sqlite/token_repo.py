"""Repositório SQLite para tokens OAuth.

Fase 3 — preparação da infra. O core/gsheets_client.py continua lendo do
arquivo .credentials/token.json. A migração completa fica para a Fase 4.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

_DEFAULT_DB_PATH = Path(".credentials/app.db")


class SQLiteTokenRepository:
    """Persiste e carrega tokens OAuth no SQLite."""

    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = db_path or _DEFAULT_DB_PATH
        self._init_table()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_table(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS oauth_tokens (
                    service    TEXT PRIMARY KEY,
                    token_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def save_token(self, service: str, token_dict: dict) -> None:
        """Persiste ou atualiza o token de um serviço (ex: 'google_sheets')."""
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO oauth_tokens (service, token_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(service) DO UPDATE SET
                    token_json = excluded.token_json,
                    updated_at = excluded.updated_at
                """,
                (service, json.dumps(token_dict), now),
            )

    def load_token(self, service: str) -> dict | None:
        """Carrega o token de um serviço. Retorna None se não existir."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT token_json FROM oauth_tokens WHERE service = ?",
                (service,),
            ).fetchone()
        if row is None:
            return None
        try:
            return json.loads(row["token_json"])
        except Exception:
            return None
