from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .gsheets_client import CREDENTIALS_DIR, extract_sheet_id, get_credentials

WORKFLOW_CONTEXT_PATH = CREDENTIALS_DIR / "workflow_context.json"
VALID_KEYS = {"master", "mix"}


def _load_context() -> dict[str, Any]:
    if not WORKFLOW_CONTEXT_PATH.exists():
        return {}
    try:
        return json.loads(WORKFLOW_CONTEXT_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_context(payload: dict[str, Any]) -> None:
    WORKFLOW_CONTEXT_PATH.parent.mkdir(parents=True, exist_ok=True)
    WORKFLOW_CONTEXT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def set_workflow_sheet(key: str, link_or_id: str) -> dict[str, Any]:
    key_norm = str(key or "").strip().lower()
    if key_norm not in VALID_KEYS:
        raise ValueError("Tipo de planilha inválido. Use 'master' ou 'mix'.")

    sheet_id = extract_sheet_id(link_or_id)
    if not sheet_id:
        raise ValueError("Link/ID da planilha inválido")

    creds = get_credentials()
    service = build("sheets", "v4", credentials=creds, cache_discovery=False)
    try:
        metadata = service.spreadsheets().get(spreadsheetId=sheet_id).execute()
    except HttpError as exc:
        raise ValueError("Não foi possível acessar essa planilha") from exc

    info = {
        "sheet_id": sheet_id,
        "title": metadata.get("properties", {}).get("title"),
        "url": f"https://docs.google.com/spreadsheets/d/{sheet_id}",
    }
    context = _load_context()
    context[key_norm] = info
    _save_context(context)
    return info


def get_workflow_sheet(key: str) -> dict[str, Any] | None:
    key_norm = str(key or "").strip().lower()
    if key_norm not in VALID_KEYS:
        return None
    context = _load_context()
    info = context.get(key_norm)
    if isinstance(info, dict) and info.get("sheet_id"):
        return info
    return None


def get_workflow_context() -> dict[str, Any]:
    context = _load_context()
    return {
        "master": context.get("master") if isinstance(context.get("master"), dict) else None,
        "mix": context.get("mix") if isinstance(context.get("mix"), dict) else None,
    }

