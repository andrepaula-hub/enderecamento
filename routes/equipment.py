"""Rotas de gestão de equipamentos (criar, deletar, alterar tipo, gerar slots)."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.gsheets_backend import (
    change_equipment_type_gsheet,
    create_new_equipment_gsheet,
    delete_equipment_and_products_gsheet,
    generate_layout_atual_gsheet,
    generate_slots_from_cadastro_gsheet,
)
from core.workflow_context import get_workflow_sheet
from routes._state import ScriptRequest, _require_active_sheet

router = APIRouter()


@router.post("/api/changeEquipmentType")
def api_change_equipment_type(req: ScriptRequest) -> JSONResponse:
    equip_id = req.args[0] if len(req.args) > 0 else ""
    new_type = req.args[1] if len(req.args) > 1 else ""
    recolher = bool(req.args[2]) if len(req.args) > 2 else False
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    master = get_workflow_sheet("master")
    master_id = master.get("sheet_id") if master else None
    result = change_equipment_type_gsheet(active["sheet_id"], equip_id, new_type, recolher, master_sheet_id=master_id)
    return JSONResponse(result)


@router.post("/api/createNewEquipment")
def api_create_new_equipment(req: ScriptRequest) -> JSONResponse:
    rua_num = req.args[0] if len(req.args) > 0 else None
    equip_num = req.args[1] if len(req.args) > 1 else None
    equip_type = req.args[2] if len(req.args) > 2 else ""
    user = req.args[3] if len(req.args) > 3 else "local"
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    master = get_workflow_sheet("master")
    master_id = master.get("sheet_id") if master else None
    result = create_new_equipment_gsheet(
        active["sheet_id"], rua_num, equip_num, equip_type, user=user, master_sheet_id=master_id
    )
    return JSONResponse(result)


@router.post("/api/deleteEquipmentAndProducts")
def api_delete_equipment_and_products(req: ScriptRequest) -> JSONResponse:
    equip_id = req.args[0] if len(req.args) > 0 else ""
    user = req.args[1] if len(req.args) > 1 else "local"
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    result = delete_equipment_and_products_gsheet(active["sheet_id"], equip_id, user=user)
    return JSONResponse(result)


@router.post("/api/generateSlotsFromCadastro")
def api_generate_slots_from_cadastro(req: ScriptRequest) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha ALVO primeiro."})
    clear_existing = bool(req.args[0]) if req.args else True
    master = get_workflow_sheet("master")
    master_id = master.get("sheet_id") if master else None
    result = generate_slots_from_cadastro_gsheet(active["sheet_id"], clear_existing=clear_existing, master_sheet_id=master_id)
    return JSONResponse(result)


@router.post("/api/generateLayoutAtual")
def api_generate_layout_atual(req: ScriptRequest) -> JSONResponse:
    args = req.args if req.args else []
    depara_sheet = args[0] if len(args) > 0 and args[0] else None
    output_sheet = args[1] if len(args) > 1 and args[1] else None
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    result = generate_layout_atual_gsheet(
        active["sheet_id"],
        depara_sheet or "DePara",
        output_sheet or "Plano_Enderecamento_Final_Layout_Atual",
    )
    return JSONResponse(result)
