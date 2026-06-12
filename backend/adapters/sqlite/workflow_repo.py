from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from backend.config import SQLITE_PATH
from backend.domain.workflow_sheet import WorkflowSheet
from backend.ports.workflow_repo import WorkflowRepository

_DEFAULT_DB_PATH = SQLITE_PATH


class SQLiteWorkflowRepository(WorkflowRepository):
    """Implementa WorkflowRepository usando SQLite stdlib.

    Usa .credentials/workflow_context.json como fallback de migração gradual
    quando o banco está vazio.
    """

    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = db_path or _DEFAULT_DB_PATH
        self._ensure_table()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _connect(self) -> sqlite3.Connection:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_table(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS workflow_sheets (
                    target_sheet_id TEXT PRIMARY KEY,
                    store_id        TEXT NOT NULL DEFAULT '',
                    master_sheet_id TEXT NOT NULL DEFAULT '',
                    mix_sheet_id    TEXT NOT NULL DEFAULT '',
                    target_title    TEXT NOT NULL DEFAULT '',
                    master_title    TEXT NOT NULL DEFAULT '',
                    mix_title       TEXT NOT NULL DEFAULT '',
                    is_active       INTEGER NOT NULL DEFAULT 0
                )
                """
            )

    def _row_to_workflow(self, row: sqlite3.Row) -> WorkflowSheet:
        return WorkflowSheet(
            store_id=row["store_id"],
            target_sheet_id=row["target_sheet_id"],
            master_sheet_id=row["master_sheet_id"],
            mix_sheet_id=row["mix_sheet_id"],
            target_title=row["target_title"],
            master_title=row["master_title"],
            mix_title=row["mix_title"],
            is_active=bool(row["is_active"]),
        )

    # ------------------------------------------------------------------
    # WorkflowRepository interface
    # ------------------------------------------------------------------

    def save(self, workflow: WorkflowSheet) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO workflow_sheets
                    (target_sheet_id, store_id, master_sheet_id, mix_sheet_id,
                     target_title, master_title, mix_title, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(target_sheet_id) DO UPDATE SET
                    store_id        = excluded.store_id,
                    master_sheet_id = excluded.master_sheet_id,
                    mix_sheet_id    = excluded.mix_sheet_id,
                    target_title    = excluded.target_title,
                    master_title    = excluded.master_title,
                    mix_title       = excluded.mix_title,
                    is_active       = excluded.is_active
                """,
                (
                    workflow.target_sheet_id,
                    workflow.store_id,
                    workflow.master_sheet_id,
                    workflow.mix_sheet_id,
                    workflow.target_title,
                    workflow.master_title,
                    workflow.mix_title,
                    1 if workflow.is_active else 0,
                ),
            )

    def get_by_store(self, store_id: str) -> WorkflowSheet | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM workflow_sheets WHERE store_id = ? LIMIT 1",
                (store_id,),
            ).fetchone()
        if row:
            return self._row_to_workflow(row)
        return self._fallback_from_json()

    def get_active(self) -> WorkflowSheet | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM workflow_sheets WHERE is_active = 1 LIMIT 1",
            ).fetchone()
        if row:
            return self._row_to_workflow(row)
        return self._fallback_from_json()

    def set_active(self, sheet_id: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE workflow_sheets SET is_active = 0")
            conn.execute(
                "UPDATE workflow_sheets SET is_active = 1 WHERE target_sheet_id = ?",
                (sheet_id,),
            )

    # ------------------------------------------------------------------
    # Migração gradual: lê workflow_context.json se DB vazio
    # ------------------------------------------------------------------

    def _fallback_from_json(self) -> WorkflowSheet | None:
        json_path = Path(".credentials/workflow_context.json")
        if not json_path.exists():
            return None
        try:
            ctx = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception:
            return None

        master = ctx.get("master") or {}
        mix = ctx.get("mix") or {}
        target_sheet_id = master.get("sheet_id") or ""
        if not target_sheet_id:
            return None

        return WorkflowSheet(
            store_id="",
            target_sheet_id=target_sheet_id,
            master_sheet_id=master.get("sheet_id", ""),
            mix_sheet_id=mix.get("sheet_id", ""),
            target_title=master.get("title", ""),
            master_title=master.get("title", ""),
            mix_title=mix.get("title", ""),
            is_active=True,
        )
