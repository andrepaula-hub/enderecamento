"""Gerenciamento de versões do Plano_Enderecamento_Final via Google Sheets.

Funções autocontidas que não dependem de helpers de gsheets_backend —
importam apenas GSheetsClient e utils.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from .gsheets_client import GSheetsClient
from .utils import normalize_string

SHEET_PLANO_FINAL = "Plano_Enderecamento_Final"
SHEET_VERSION_PREFIX = "VERSAO_ENDERECAMENTO__"


def _sanitize_version_name(name: str) -> str:
    text = normalize_string(name)
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text or "sem_nome"


def _build_version_sheet_name(client: GSheetsClient, name: str) -> str:
    timestamp = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y%m%d_%H%M%S")
    base = _sanitize_version_name(name)
    raw = f"{SHEET_VERSION_PREFIX}{timestamp}__{base}"
    # Google Sheets limit ~= 100 chars
    sheet_name = raw[:100]
    existing = set(client.list_sheet_names())
    if sheet_name not in existing:
        return sheet_name
    counter = 1
    while True:
        suffix = f"_{counter}"
        trimmed = sheet_name[: max(0, 100 - len(suffix))]
        candidate = f"{trimmed}{suffix}"
        if candidate not in existing:
            return candidate
        counter += 1


def save_plano_version_gsheet(sheet_id: str, name: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    values = client.read_values(SHEET_PLANO_FINAL)
    if not values:
        return {"success": False, "error": "Aba Plano_Enderecamento_Final vazia ou não encontrada."}
    sheet_name = _build_version_sheet_name(client, name)
    client.ensure_sheet(sheet_name)
    client.clear_sheet(sheet_name)
    client.append_rows(sheet_name, values)
    return {"success": True, "version_id": sheet_name, "label": sheet_name}


def list_plano_versions_gsheet(sheet_id: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    names = client.list_sheet_names()
    versions: list[dict[str, Any]] = []
    for name in names:
        if not name.startswith(SHEET_VERSION_PREFIX):
            continue
        display = name.replace(SHEET_VERSION_PREFIX, "").replace("__", " ")
        versions.append({"version_id": name, "label": display, "sheet_name": name})
    versions.sort(key=lambda v: v.get("version_id", ""), reverse=True)
    return {"success": True, "versions": versions}


def restore_plano_version_gsheet(sheet_id: str, version_id: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    if version_id not in client.list_sheet_names():
        return {"success": False, "error": "Versão não encontrada."}
    values = client.read_values(version_id)
    if not values:
        return {"success": False, "error": "Versão vazia."}
    client.clear_sheet(SHEET_PLANO_FINAL)
    client.append_rows(SHEET_PLANO_FINAL, values)
    return {"success": True, "rows": len(values), "cols": len(values[0]) if values else 0}


def delete_plano_version_gsheet(sheet_id: str, version_id: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    if version_id not in client.list_sheet_names():
        return {"success": False, "error": "Versão não encontrada."}
    if not version_id.startswith(SHEET_VERSION_PREFIX):
        return {"success": False, "error": "Apenas versões podem ser removidas."}
    client.delete_sheet(version_id)
    return {"success": True}
