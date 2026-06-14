"""Rotas de versionamento do plano de endereçamento."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.gsheets_backend import (
    delete_plano_version_gsheet,
    list_plano_versions_gsheet,
    restore_plano_version_gsheet,
    save_plano_version_gsheet,
)
from core.versioning import (
    delete_plano_version_xlsx,
    list_plano_versions_xlsx,
    restore_plano_version_xlsx,
    save_plano_version_xlsx,
)
from routes._state import DATA_XLSX_PATH, ScriptRequest, _require_active_sheet

router = APIRouter()


@router.post("/api/savePlanoVersion")
def api_save_plano_version(req: ScriptRequest) -> JSONResponse:
    name = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if active:
        return JSONResponse(save_plano_version_gsheet(active["sheet_id"], name))
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        return JSONResponse(save_plano_version_xlsx(DATA_XLSX_PATH, name))
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@router.post("/api/listPlanoVersions")
def api_list_plano_versions(_: ScriptRequest | None = None) -> JSONResponse:
    active = _require_active_sheet()
    if active:
        return JSONResponse(list_plano_versions_gsheet(active["sheet_id"]))
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        return JSONResponse(list_plano_versions_xlsx(DATA_XLSX_PATH))
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@router.post("/api/restorePlanoVersion")
def api_restore_plano_version(req: ScriptRequest) -> JSONResponse:
    version_id = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if active:
        return JSONResponse(restore_plano_version_gsheet(active["sheet_id"], version_id))
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        return JSONResponse(restore_plano_version_xlsx(DATA_XLSX_PATH, version_id))
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@router.post("/api/deletePlanoVersion")
def api_delete_plano_version(req: ScriptRequest) -> JSONResponse:
    version_id = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if active:
        return JSONResponse(delete_plano_version_gsheet(active["sheet_id"], version_id))
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        return JSONResponse(delete_plano_version_xlsx(version_id))
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
