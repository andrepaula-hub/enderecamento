"""Rotas de conexão com planilhas e carregamento de dados iniciais."""
from __future__ import annotations

import os
import re

from fastapi import APIRouter
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse

from core.gsheets_backend import get_initial_data_gsheet
from core.gsheets_client import GSheetsClient, get_active_sheet, set_active_sheet
from core.initial_data import get_initial_data
from core.metabase_sales import CARD175_CARD_ID, CARD175_STORE_CODE_BY_ID, get_metabase_sales_context
from core.workflow_context import get_workflow_context, get_workflow_sheet, set_workflow_sheet
from routes._state import (
    APP_ROOT,
    DATA_XLSX_PATH,
    SHOPPER_FRONT_ROOT,
    ScriptRequest,
    _normalize_initial_data,
    _require_active_sheet,
)

router = APIRouter()


@router.get("/")
def index() -> HTMLResponse:
    # Bust Babel's URL-keyed compile cache by appending mtime of JSX/JS files
    mtime = max(
        (int(os.path.getmtime(p)) for p in SHOPPER_FRONT_ROOT.glob("*.jsx") if p.is_file()),
        default=0,
    )
    html = (SHOPPER_FRONT_ROOT / "index.html").read_text(encoding="utf-8")
    html = re.sub(
        r'(src="/shopper-static/[^"]+\.(?:jsx|js))"',
        rf'\1?v={mtime}"',
        html,
    )
    return HTMLResponse(
        content=html,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@router.get("/api/download")
def download() -> FileResponse:
    media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    active = _require_active_sheet()
    if not active:
        if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
            return FileResponse(DATA_XLSX_PATH, filename=DATA_XLSX_PATH.name, media_type=media_type)
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa para exportar."})
    client = GSheetsClient(active["sheet_id"])
    tmp_path = APP_ROOT / ".credentials" / "export.xlsx"
    client.export_xlsx(tmp_path)
    return FileResponse(tmp_path, filename="enderecamento-atual.xlsx", media_type=media_type)


@router.get("/api/file")
def api_file(path: str) -> FileResponse:
    from pathlib import Path
    candidate = Path(path).expanduser().resolve()
    if not candidate.exists() or not candidate.is_file():
        raise FileNotFoundError("Arquivo não encontrado.")
    return FileResponse(candidate)


@router.post("/api/connectSheet")
def api_connect_sheet(req: ScriptRequest) -> JSONResponse:
    link = req.args[0] if req.args else ""
    try:
        info = set_active_sheet(link)
        return JSONResponse({"success": True, "sheet": info})
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/connectMasterSheet")
def api_connect_master_sheet(req: ScriptRequest) -> JSONResponse:
    link = req.args[0] if req.args else ""
    try:
        info = set_workflow_sheet("master", link)
        return JSONResponse({"success": True, "sheet": info})
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/connectMixSheet")
def api_connect_mix_sheet(req: ScriptRequest) -> JSONResponse:
    link = req.args[0] if req.args else ""
    try:
        info = set_workflow_sheet("mix", link)
        return JSONResponse({"success": True, "sheet": info})
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/connectWorkflowSheets")
def api_connect_workflow_sheets(req: ScriptRequest) -> JSONResponse:
    target_link = req.args[0] if len(req.args) > 0 else ""
    master_link = req.args[1] if len(req.args) > 1 else ""
    mix_link = req.args[2] if len(req.args) > 2 else ""
    try:
        target_info = set_active_sheet(target_link) if target_link else get_active_sheet()
        master_info = set_workflow_sheet("master", master_link) if master_link else get_workflow_sheet("master")
        mix_info = set_workflow_sheet("mix", mix_link) if mix_link else get_workflow_sheet("mix")
        return JSONResponse(
            {"success": True, "target": target_info, "master": master_info, "mix": mix_info}
        )
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/getWorkflowSheets")
def api_get_workflow_sheets(_: ScriptRequest | None = None) -> JSONResponse:
    active = get_active_sheet()
    context = get_workflow_context()
    return JSONResponse(
        {
            "success": True,
            "target": active if active and active.get("sheet_id") else None,
            "master": context.get("master"),
            "mix": context.get("mix"),
            "metabase_sales": get_metabase_sales_context(),
            "card175": {
                "card_id": CARD175_CARD_ID,
                "store_code_by_id": CARD175_STORE_CODE_BY_ID,
            },
        }
    )


@router.post("/api/getActiveSheet")
def api_get_active_sheet(_: ScriptRequest | None = None) -> JSONResponse:
    return JSONResponse({"success": True, "sheet": get_active_sheet()})


@router.post("/api/getInitialData")
def api_get_initial_data(_: ScriptRequest | None = None) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
            data = get_initial_data(DATA_XLSX_PATH)
            return JSONResponse(_normalize_initial_data(data))
        return JSONResponse({"error": "Cole o link/ID da planilha no topo e clique em Conectar."})
    master = get_workflow_sheet("master")
    master_id = master.get("sheet_id") if master else None
    data = get_initial_data_gsheet(active["sheet_id"], master_sheet_id=master_id)
    return JSONResponse(_normalize_initial_data(data))


@router.post("/api/getMapLoadStatus")
def api_get_map_load_status(_: ScriptRequest | None = None) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    sheet_name = "Plano_Enderecamento_Final"
    try:
        client = GSheetsClient(active["sheet_id"])
        try:
            values = client.read_values(sheet_name)
        except Exception:
            return JSONResponse(
                {"success": True, "ready": False, "sheet_name": sheet_name, "rows": 0, "reason": "Aba não encontrada"}
            )
        rows = max(0, len(values) - 1) if values else 0
        return JSONResponse({"success": True, "ready": rows > 0, "sheet_name": sheet_name, "rows": rows})
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})
