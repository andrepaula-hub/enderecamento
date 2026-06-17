"""Gerenciamento de versões do Plano_Enderecamento_Final via Google Sheets.

Funções autocontidas que não dependem de helpers de gsheets_backend —
importam apenas GSheetsClient e utils.
"""
from __future__ import annotations

import re
import json
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from .gsheets_client import CREDENTIALS_DIR, GSheetsClient
from .utils import normalize_string

SHEET_PLANO_FINAL = "Plano_Enderecamento_Final"
SHEET_VERSION_PREFIX = "VERSAO_ENDERECAMENTO__"
SHEET_VERSION_SUFFIX = "_ENDERECAMENTO"
VERSION_METADATA_PATH = CREDENTIALS_DIR / "gsheets_version_metadata.json"


def _sanitize_version_name(name: str) -> str:
    text = normalize_string(name)
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text or "sem_nome"


def _version_display_name(base: str, sequence: int) -> str:
    return f"{base}{SHEET_VERSION_SUFFIX}[{sequence}]"


def _read_version_metadata() -> dict[str, Any]:
    if not VERSION_METADATA_PATH.exists():
        return {}
    try:
        return json.loads(VERSION_METADATA_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_version_metadata(payload: dict[str, Any]) -> None:
    VERSION_METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    VERSION_METADATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _store_version_metadata(sheet_id: str, version_id: str, display_name: str, created_at: str) -> None:
    payload = _read_version_metadata()
    payload.setdefault(sheet_id, {})
    payload[sheet_id][version_id] = {
        "display_name": display_name,
        "created_at": created_at,
    }
    _write_version_metadata(payload)


def _remove_version_metadata(sheet_id: str, version_id: str) -> None:
    payload = _read_version_metadata()
    if sheet_id in payload and version_id in payload[sheet_id]:
        del payload[sheet_id][version_id]
        if not payload[sheet_id]:
            del payload[sheet_id]
        _write_version_metadata(payload)


def _is_version_sheet_name(name: str) -> bool:
    if name.startswith(SHEET_VERSION_PREFIX):
        return True
    return bool(re.match(rf"^.+{re.escape(SHEET_VERSION_SUFFIX)}\[\d+\]$", name))


def _legacy_label_and_timestamp(name: str) -> tuple[str, str]:
    clean = name.replace(SHEET_VERSION_PREFIX, "")
    parts = clean.split("__")
    stamp = parts[0] if parts else ""
    base_name = " ".join(parts[1:]).strip() if len(parts) > 1 else clean
    created_at = ""
    if re.fullmatch(r"\d{8}_\d{6}", stamp):
        created_at = (
            f"{stamp[0:4]}-{stamp[4:6]}-{stamp[6:8]}T"
            f"{stamp[9:11]}:{stamp[11:13]}:{stamp[13:15]}-03:00"
        )
    return base_name or name, created_at


def _build_version_sheet_name(client: GSheetsClient, name: str) -> str:
    base = _sanitize_version_name(name)
    existing = set(client.list_sheet_names())
    normalized_base = re.sub(rf"{re.escape(SHEET_VERSION_SUFFIX)}\[\d+\]$", "", base).strip() or "sem_nome"
    counter = 1
    while True:
        raw = _version_display_name(normalized_base, counter)
        sheet_name = raw[:100]
        if sheet_name not in existing:
            return sheet_name
        counter += 1


def save_plano_version_gsheet(sheet_id: str, name: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    values = client.read_values(SHEET_PLANO_FINAL)
    if not values:
        return {"success": False, "error": "Aba Plano_Enderecamento_Final vazia ou não encontrada."}
    sheet_name = _build_version_sheet_name(client, name)
    created_at = datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat()
    client.ensure_sheet(sheet_name)
    client.clear_sheet(sheet_name)
    client.append_rows(sheet_name, values)
    _store_version_metadata(sheet_id, sheet_name, sheet_name, created_at)
    return {
        "success": True,
        "version_id": sheet_name,
        "label": sheet_name,
        "timestamp": created_at,
        "sheet_name": sheet_name,
        "sheet_url": client.get_sheet_url(sheet_name),
        "plano_sheet_name": SHEET_PLANO_FINAL,
        "plano_sheet_url": client.get_sheet_url(SHEET_PLANO_FINAL),
    }


def list_plano_versions_gsheet(sheet_id: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    names = client.list_sheet_names()
    metadata = _read_version_metadata().get(sheet_id, {})
    versions: list[dict[str, Any]] = []
    for name in names:
        if not _is_version_sheet_name(name):
            continue
        meta = metadata.get(name, {})
        if name.startswith(SHEET_VERSION_PREFIX):
            legacy_label, legacy_timestamp = _legacy_label_and_timestamp(name)
            label = meta.get("display_name") or legacy_label
            created_at = meta.get("created_at") or legacy_timestamp
        else:
            label = meta.get("display_name") or name
            created_at = meta.get("created_at") or ""
        versions.append({"version_id": name, "label": label, "sheet_name": name, "timestamp": created_at})
    versions.sort(key=lambda v: str(v.get("timestamp") or v.get("version_id") or ""), reverse=True)
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
    if not _is_version_sheet_name(version_id):
        return {"success": False, "error": "Apenas versões podem ser removidas."}
    client.delete_sheet(version_id)
    _remove_version_metadata(sheet_id, version_id)
    return {"success": True}
