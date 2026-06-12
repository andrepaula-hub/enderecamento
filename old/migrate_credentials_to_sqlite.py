"""Migra .credentials/workflow_context.json e .credentials/active_sheet.json para SQLite.

Formato real dos arquivos:
- workflow_context.json: {"mix": {"sheet_id": "...", "title": "...", "url": "..."}, "master": {...}}
- active_sheet.json:     {"sheet_id": "...", "title": "...", "url": "..."}

O WorkflowRepository existente usa target_sheet_id como PK e is_active como flag.
"""
from __future__ import annotations

import json
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
import sys

# Permite rodar com: python scripts/migrate_credentials_to_sqlite.py
sys.path.insert(0, str(Path(__file__).parent.parent))

DB_PATH = Path(".credentials/app.db")
CONTEXT_JSON = Path(".credentials/workflow_context.json")
ACTIVE_JSON = Path(".credentials/active_sheet.json")


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_tables(conn: sqlite3.Connection) -> None:
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
    conn.commit()


def main() -> None:
    print(f"Banco de dados: {DB_PATH.resolve()}")

    conn = _connect(DB_PATH)
    _ensure_tables(conn)

    target_sheet_id: str = ""
    target_title: str = ""
    master_sheet_id: str = ""
    master_title: str = ""
    mix_sheet_id: str = ""
    mix_title: str = ""

    # 1. Lê active_sheet.json -> target
    if ACTIVE_JSON.exists():
        shutil.copy(ACTIVE_JSON, ACTIVE_JSON.with_suffix(".json.bak"))
        print(f"Backup criado: {ACTIVE_JSON.with_suffix('.json.bak')}")
        active_data = json.loads(ACTIVE_JSON.read_text(encoding="utf-8"))
        target_sheet_id = str(active_data.get("sheet_id") or "")
        target_title = str(active_data.get("title") or "")
        print(f"Target sheet: {target_title} ({target_sheet_id})")
    else:
        print("Nenhum active_sheet.json encontrado.")

    # 2. Lê workflow_context.json -> master + mix
    if CONTEXT_JSON.exists():
        shutil.copy(CONTEXT_JSON, CONTEXT_JSON.with_suffix(".json.bak"))
        print(f"Backup criado: {CONTEXT_JSON.with_suffix('.json.bak')}")
        ctx = json.loads(CONTEXT_JSON.read_text(encoding="utf-8"))
        master = ctx.get("master") or {}
        mix = ctx.get("mix") or {}
        master_sheet_id = str(master.get("sheet_id") or "")
        master_title = str(master.get("title") or "")
        mix_sheet_id = str(mix.get("sheet_id") or "")
        mix_title = str(mix.get("title") or "")
        print(f"Master sheet: {master_title} ({master_sheet_id})")
        print(f"Mix sheet:    {mix_title} ({mix_sheet_id})")
    else:
        print("Nenhum workflow_context.json encontrado.")

    # 3. Persiste no SQLite (usando target_sheet_id como PK, igual ao workflow_repo.py)
    if target_sheet_id or master_sheet_id:
        # Se não temos target, usa master como target (fallback do _fallback_from_json original)
        effective_target = target_sheet_id or master_sheet_id
        effective_target_title = target_title or master_title

        existing = conn.execute(
            "SELECT 1 FROM workflow_sheets WHERE target_sheet_id = ?", (effective_target,)
        ).fetchone()

        if existing:
            print(f"Registro já existe para target_sheet_id={effective_target} — atualizando.")
            conn.execute(
                """
                UPDATE workflow_sheets SET
                    master_sheet_id = ?, mix_sheet_id = ?,
                    target_title = ?, master_title = ?, mix_title = ?,
                    is_active = 1
                WHERE target_sheet_id = ?
                """,
                (master_sheet_id, mix_sheet_id, effective_target_title, master_title, mix_title, effective_target),
            )
        else:
            print(f"Inserindo workflow: target={effective_target}")
            conn.execute(
                """
                INSERT INTO workflow_sheets
                    (target_sheet_id, store_id, master_sheet_id, mix_sheet_id,
                     target_title, master_title, mix_title, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
                """,
                (effective_target, "", master_sheet_id, mix_sheet_id,
                 effective_target_title, master_title, mix_title),
            )
        conn.commit()
        print("Migração concluída com sucesso.")
    else:
        print("Nenhum dado de workflow encontrado para migrar — banco inicializado vazio.")

    conn.close()


if __name__ == "__main__":
    main()
