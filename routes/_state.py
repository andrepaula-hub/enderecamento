"""Estado compartilhado e helpers usados por todos os routers."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from core.gsheets_client import get_active_sheet

APP_ROOT = Path(__file__).resolve().parents[1]
SHOPPER_FRONT_ROOT = APP_ROOT / "shopper_front"
DATA_XLSX_ENV = os.environ.get("ENDERECAMENTO_XLSX")
DATA_XLSX_PATH = Path(DATA_XLSX_ENV).resolve() if DATA_XLSX_ENV else None
AGENT_WORKFLOW_STATUS_PATH = APP_ROOT / ".credentials" / "agent_workflow_status.json"
AGENT_MASTER_SHEET_LINK = (
    os.environ.get("ENDERECAMENTO_MASTER_SHEET")
    or os.environ.get("ETL_MASTER_SHEET")
    or os.environ.get("AGENT_ETL_MASTER_SHEET")
    or "https://docs.google.com/spreadsheets/d/1mCoybEaeIFGfr12mt2-vAooeLDRCQJw7NOZlWD5WDxk"
).strip()


class ScriptRequest(BaseModel):
    args: list[Any] = []


def _write_agent_workflow_status(payload: dict[str, Any]) -> None:
    AGENT_WORKFLOW_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    AGENT_WORKFLOW_STATUS_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def _read_agent_workflow_status() -> dict[str, Any]:
    if not AGENT_WORKFLOW_STATUS_PATH.exists():
        return {}
    try:
        return json.loads(AGENT_WORKFLOW_STATUS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _require_agent_prepared(sheet_id: str) -> dict[str, Any] | None:
    status = _read_agent_workflow_status()
    if status.get("target_sheet_id") != sheet_id:
        return {
            "success": False,
            "error": "Fluxo do agente ainda não foi preparado para esta planilha. Rode /api/agent/prepareWorkflow antes da prévia.",
        }
    if not status.get("slots_ready"):
        return {
            "success": False,
            "error": "Plano_Enderecamento_Final ainda não está pronto. Rode prepareWorkflow e corrija geração de escaninhos antes da prévia.",
        }
    if not status.get("etl_success"):
        return {
            "success": False,
            "error": "ETL não foi concluído com sucesso. A prévia de endereçamento está bloqueada.",
        }
    return None


def _normalize_initial_data(data: Any) -> dict[str, Any]:
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            data = {}
    if not isinstance(data, dict):
        data = {}
    defaults = {
        "content_html": "",
        "failed_products_section": "",
        "all_products_json": "[]",
        "product_location_map_json": "{}",
        "unallocated_products_json": "{}",
        "all_products_data_map_json": "{}",
        "equipTypesJson": "[]",
        "metrics_panel_data_json": "{}",
        "barcode_map_json": "{}",
        "spreadsheet_title": "Dashboard Interativo da Loja",
        "limite_peso_kg": 0,
    }
    for key, value in defaults.items():
        if key not in data or data[key] is None:
            data[key] = value
    return data


def _require_active_sheet() -> dict[str, Any] | None:
    active = get_active_sheet()
    if active and active.get("sheet_id"):
        return active
    return None
