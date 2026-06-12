from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.config import SQLITE_PATH

_DEFAULT_DB_PATH = SQLITE_PATH

logger = logging.getLogger("enderecamento.jobs")


class JobService:
    """Gerencia jobs assíncronos persistidos no SQLite.

    Status possíveis: pending | running | done | failed
    """

    def __init__(self, db_path: Path | None = None) -> None:
        self._db = db_path or _DEFAULT_DB_PATH
        self._init_table()

    def _conn(self) -> sqlite3.Connection:
        self._db.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._db))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_table(self) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS jobs (
                  id         TEXT PRIMARY KEY,
                  type       TEXT NOT NULL,
                  status     TEXT NOT NULL,
                  payload    TEXT,
                  result     TEXT,
                  error      TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                )
                """
            )

    def enqueue(self, job_type: str, payload: dict | None = None) -> str:
        """Cria um novo job com status 'pending' e retorna o job_id."""
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)",
                (job_id, job_type, "pending", json.dumps(payload or {}), None, None, now, now),
            )
        logger.info('"job_enqueued", "job_id": "%s", "type": "%s"', job_id, job_type)
        return job_id

    def update(
        self,
        job_id: str,
        status: str,
        result: Any = None,
        error: str | None = None,
    ) -> None:
        """Atualiza o status (e opcionalmente result/error) de um job."""
        now = datetime.now(timezone.utc).isoformat()
        with self._conn() as conn:
            conn.execute(
                "UPDATE jobs SET status=?, result=?, error=?, updated_at=? WHERE id=?",
                (
                    status,
                    json.dumps(result) if result is not None else None,
                    error,
                    now,
                    job_id,
                ),
            )
        if error:
            logger.warning('"job_updated", "job_id": "%s", "status": "%s", "error": "%s"', job_id, status, error)
        else:
            logger.info('"job_updated", "job_id": "%s", "status": "%s"', job_id, status)

    def get(self, job_id: str) -> dict | None:
        """Retorna os dados de um job ou None se não encontrado."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM jobs WHERE id=?", (job_id,)
            ).fetchone()
        if not row:
            return None
        d = dict(row)
        if d.get("result"):
            try:
                d["result"] = json.loads(d["result"])
            except Exception:
                pass
        if d.get("payload"):
            try:
                d["payload"] = json.loads(d["payload"])
            except Exception:
                pass
        return d
