"""Rotas de movimentação de produtos (batch, single move, swap)."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.card175_snapshot import append_card175_change_logs
from core.gsheets_backend import (
    execute_equipment_swap_gsheet,
    execute_swap_gsheet,
    save_batch_moves_gsheet,
    save_single_move_gsheet,
)
from core.moves import execute_equipment_swap
from routes._state import DATA_XLSX_PATH, ScriptRequest, _require_active_sheet

router = APIRouter()


@router.post("/api/saveBatchMoves")
def api_save_batch_moves(req: ScriptRequest) -> JSONResponse:
    moves = req.args[0] if req.args else []
    options = req.args[1] if len(req.args) > 1 and isinstance(req.args[1], dict) else {}
    skip_full = bool(options.get("skipFull", False))
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    result = save_batch_moves_gsheet(active["sheet_id"], moves, skip_full=skip_full)
    if result.get("success"):
        try:
            log_result = append_card175_change_logs(active["sheet_id"], moves, user="local")
            if log_result.get("logged"):
                result["card175LogsAdded"] = log_result.get("logged", 0)
        except Exception as exc:
            result["card175LogWarning"] = str(exc)
    return JSONResponse(result)


@router.post("/api/saveSingleMove")
def api_save_single_move(req: ScriptRequest) -> JSONResponse:
    move = req.args[0] if req.args else {}
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    result = save_single_move_gsheet(active["sheet_id"], move)
    if result.get("success"):
        try:
            log_result = append_card175_change_logs(active["sheet_id"], [move], user="local")
            if log_result.get("logged"):
                result["card175LogsAdded"] = log_result.get("logged", 0)
        except Exception as exc:
            result["card175LogWarning"] = str(exc)
    return JSONResponse(result)


@router.post("/api/executeSwap")
def api_execute_swap(req: ScriptRequest) -> JSONResponse:
    swap_info = req.args[0] if req.args else {}
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    result = execute_swap_gsheet(active["sheet_id"], swap_info)
    if result.get("success"):
        try:
            move_a = swap_info.get("moveA") if isinstance(swap_info, dict) else None
            move_b = swap_info.get("moveB") if isinstance(swap_info, dict) else None
            moves = [m for m in [move_a, move_b] if isinstance(m, dict)]
            if moves:
                log_result = append_card175_change_logs(active["sheet_id"], moves, user="local")
                if log_result.get("logged"):
                    result["card175LogsAdded"] = log_result.get("logged", 0)
        except Exception as exc:
            result["card175LogWarning"] = str(exc)
    return JSONResponse(result)


@router.post("/api/executeEquipmentSwap")
def api_execute_equipment_swap(req: ScriptRequest) -> JSONResponse:
    equip_a = req.args[0] if len(req.args) > 0 else ""
    equip_b = req.args[1] if len(req.args) > 1 else ""
    user = req.args[2] if len(req.args) > 2 else "local"
    active = _require_active_sheet()
    if active:
        return JSONResponse(execute_equipment_swap_gsheet(active["sheet_id"], equip_a, equip_b, user))
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        return JSONResponse(execute_equipment_swap(DATA_XLSX_PATH, equip_a, equip_b, user))
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
