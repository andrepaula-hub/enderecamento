from __future__ import annotations

import base64
import io
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from openpyxl import Workbook
from pydantic import BaseModel

from core.barcode import get_product_by_barcode
from core.bulk_remove import preview_remove_all_products_by_filter_xlsx, remove_all_products_by_filter_xlsx
from core.initial_data import get_initial_data
from core.kdabra import generate_kdabra_enderecar_sheet, generate_kdabra_sheet
from core.moves import execute_equipment_swap, execute_swap, save_batch_moves, save_single_move
from core.reports import generate_sku_report_custom
from core.versioning import (
    delete_plano_version_xlsx,
    list_plano_versions_xlsx,
    restore_plano_version_xlsx,
    save_plano_version_xlsx,
)
from core.gsheets_backend import (
    add_new_product_gsheet,
    change_equipment_type_gsheet,
    create_new_equipment_gsheet,
    delete_equipment_and_products_gsheet,
    delete_plano_version_gsheet,
    execute_swap_gsheet,
    execute_equipment_swap_gsheet,
    generate_slots_from_cadastro_gsheet,
    generate_layout_atual_gsheet,
    generate_kdabra_enderecar_sheet_gsheet,
    generate_kdabra_sheet_gsheet,
    generate_sku_report_custom_gsheet,
    get_initial_data_gsheet,
    get_product_by_barcode_gsheet,
    preview_remove_all_products_by_filter_gsheet,
    remove_all_products_by_filter_gsheet,
    list_plano_versions_gsheet,
    restore_plano_version_gsheet,
    save_plano_version_gsheet,
    save_batch_moves_gsheet,
    save_single_move_gsheet,
    update_base_product_gsheet,
)
from core.enrichment_pipeline import refresh_single_etl_warning, run_etl_to_base_products, sanitize_mix_duplicates
from core.etl_warning_mappings import (
    get_etl_mapping_options,
    save_etl_warning_mappings,
    send_warning_group_to_etl,
    send_missing_volumetria_with_default,
)
from core.metabase_sales import (
    build_vendas_alvo_from_metabase,
    fetch_card_823_rows,
    fetch_card_823_rows_result,
    get_metabase_sales_context,
    write_metabase_rows_to_xlsx,
)
from core.gsheets_client import (
    GSheetsClient,
    get_active_sheet,
    set_active_sheet,
)
from core.workflow_context import get_workflow_context, get_workflow_sheet, set_workflow_sheet
from core.card175_snapshot import append_card175_change_logs, import_card175_snapshot

APP_ROOT = Path(__file__).resolve().parent
DEFAULT_XLSX = APP_ROOT / "ETL" / "ENDERECAMENTO_DARK_PINHEIROS (teste) (2).xlsx"
DATA_XLSX_ENV = os.environ.get("ENDERECAMENTO_XLSX")
DATA_XLSX_PATH = Path(DATA_XLSX_ENV).resolve() if DATA_XLSX_ENV else None

app = FastAPI(title="Enderecamento Local")


@app.exception_handler(Exception)
async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
    print("Unhandled error:", repr(exc))
    return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})


class ScriptRequest(BaseModel):
    args: list[Any] = []


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


@app.get("/")
def index() -> FileResponse:
    return FileResponse(
        APP_ROOT / "Dahsboard.html",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


@app.get("/api/download")
def download() -> FileResponse:
    active = _require_active_sheet()
    if not active:
        if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
            return FileResponse(DATA_XLSX_PATH)
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa para exportar."})
    client = GSheetsClient(active["sheet_id"])
    tmp_path = APP_ROOT / ".credentials" / "export.xlsx"
    client.export_xlsx(tmp_path)
    return FileResponse(tmp_path)


@app.post("/api/connectSheet")
def api_connect_sheet(req: ScriptRequest) -> JSONResponse:
    link = req.args[0] if req.args else ""
    try:
        info = set_active_sheet(link)
        return JSONResponse({"success": True, "sheet": info})
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@app.post("/api/connectMasterSheet")
def api_connect_master_sheet(req: ScriptRequest) -> JSONResponse:
    link = req.args[0] if req.args else ""
    try:
        info = set_workflow_sheet("master", link)
        return JSONResponse({"success": True, "sheet": info})
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@app.post("/api/connectMixSheet")
def api_connect_mix_sheet(req: ScriptRequest) -> JSONResponse:
    link = req.args[0] if req.args else ""
    try:
        info = set_workflow_sheet("mix", link)
        return JSONResponse({"success": True, "sheet": info})
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@app.post("/api/connectWorkflowSheets")
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


@app.post("/api/getWorkflowSheets")
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
        }
    )


@app.post("/api/importCard175Snapshot")
async def api_import_card175_snapshot(
    sheet_link: str = Form(...),
    file: UploadFile = File(...),
    user: str = Form("local"),
) -> JSONResponse:
    try:
        if not sheet_link:
            return JSONResponse({"success": False, "error": "Informe o link/ID da planilha de mapeamento."})
        if not file:
            return JSONResponse({"success": False, "error": "Arquivo do card não enviado."})
        file_bytes = await file.read()
        if not file_bytes:
            return JSONResponse({"success": False, "error": "Arquivo do card está vazio."})
        active_info = set_active_sheet(sheet_link)
        result = import_card175_snapshot(
            sheet_id=active_info["sheet_id"],
            file_bytes=file_bytes,
            source_file_name=file.filename or "card_175.xlsx",
            user=user,
        )
        if result.get("success"):
            result["sheet"] = active_info
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@app.post("/api/getMapLoadStatus")
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
                {
                    "success": True,
                    "ready": False,
                    "sheet_name": sheet_name,
                    "rows": 0,
                    "reason": "Aba não encontrada",
                }
            )
        rows = max(0, len(values) - 1) if values else 0
        return JSONResponse(
            {
                "success": True,
                "ready": rows > 0,
                "sheet_name": sheet_name,
                "rows": rows,
            }
        )
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@app.post("/api/getActiveSheet")
def api_get_active_sheet(_: ScriptRequest | None = None) -> JSONResponse:
    return JSONResponse({"success": True, "sheet": get_active_sheet()})


@app.post("/api/getInitialData")
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


@app.post("/api/saveBatchMoves")
def api_save_batch_moves(req: ScriptRequest) -> JSONResponse:
    moves = req.args[0] if req.args else []
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    result = save_batch_moves_gsheet(active["sheet_id"], moves)
    if result.get("success"):
        try:
            log_result = append_card175_change_logs(active["sheet_id"], moves, user="local")
            if log_result.get("logged"):
                result["card175LogsAdded"] = log_result.get("logged", 0)
        except Exception as exc:
            result["card175LogWarning"] = str(exc)
    return JSONResponse(result)


@app.post("/api/saveSingleMove")
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


@app.post("/api/generateLayoutAtual")
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


@app.post("/api/executeSwap")
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
            moves = []
            if isinstance(move_a, dict):
                moves.append(move_a)
            if isinstance(move_b, dict):
                moves.append(move_b)
            if moves:
                log_result = append_card175_change_logs(active["sheet_id"], moves, user="local")
                if log_result.get("logged"):
                    result["card175LogsAdded"] = log_result.get("logged", 0)
        except Exception as exc:
            result["card175LogWarning"] = str(exc)
    return JSONResponse(result)


@app.post("/api/executeEquipmentSwap")
def api_execute_equipment_swap(req: ScriptRequest) -> JSONResponse:
    equip_a = req.args[0] if len(req.args) > 0 else ""
    equip_b = req.args[1] if len(req.args) > 1 else ""
    user = req.args[2] if len(req.args) > 2 else "local"
    active = _require_active_sheet()
    if active:
        result = execute_equipment_swap_gsheet(active["sheet_id"], equip_a, equip_b, user)
        return JSONResponse(result)
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        result = execute_equipment_swap(DATA_XLSX_PATH, equip_a, equip_b, user)
        return JSONResponse(result)
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@app.post("/api/changeEquipmentType")
def api_change_equipment_type(req: ScriptRequest) -> JSONResponse:
    equip_id = req.args[0] if len(req.args) > 0 else ""
    new_type = req.args[1] if len(req.args) > 1 else ""
    recolher = bool(req.args[2]) if len(req.args) > 2 else False
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    master = get_workflow_sheet("master")
    master_id = master.get("sheet_id") if master else None
    result = change_equipment_type_gsheet(
        active["sheet_id"],
        equip_id,
        new_type,
        recolher,
        master_sheet_id=master_id,
    )
    return JSONResponse(result)


@app.post("/api/createNewEquipment")
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
        active["sheet_id"],
        rua_num,
        equip_num,
        equip_type,
        user=user,
        master_sheet_id=master_id,
    )
    return JSONResponse(result)


@app.post("/api/deleteEquipmentAndProducts")
def api_delete_equipment_and_products(req: ScriptRequest) -> JSONResponse:
    equip_id = req.args[0] if len(req.args) > 0 else ""
    user = req.args[1] if len(req.args) > 1 else "local"
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    result = delete_equipment_and_products_gsheet(active["sheet_id"], equip_id, user=user)
    return JSONResponse(result)


@app.post("/api/generateKdabraSheet")
def api_generate_kdabra_sheet(_: ScriptRequest | None = None) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    result = generate_kdabra_sheet_gsheet(active["sheet_id"])
    return JSONResponse(result)


@app.post("/api/generateKdabraEnderecarSheet")
def api_generate_kdabra_enderecar_sheet(_: ScriptRequest | None = None) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    result = generate_kdabra_enderecar_sheet_gsheet(active["sheet_id"])
    return JSONResponse(result)


@app.post("/api/runEtlToBaseProducts")
def api_run_etl_to_base_products(_: ScriptRequest | None = None) -> JSONResponse:
    target = _require_active_sheet()
    master = get_workflow_sheet("master")
    mix = get_workflow_sheet("mix")
    if not target:
        return JSONResponse({"success": False, "error": "Conecte a planilha ALVO primeiro."})
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha MÃE (ETL) primeiro."})
    if not mix or not mix.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha MIX primeiro."})
    try:
        result = run_etl_to_base_products(
            master_sheet_id=master["sheet_id"],
            mix_sheet_id=mix["sheet_id"],
            target_sheet_id=target["sheet_id"],
        )
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@app.post("/api/buildMetabaseSalesTarget")
def api_build_metabase_sales_target(req: ScriptRequest) -> JSONResponse:
    master = get_workflow_sheet("master")
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha ETL primeiro."})

    payload = req.args[0] if req.args else {}
    if not isinstance(payload, dict):
        payload = {}

    try:
        result = build_vendas_alvo_from_metabase(
            master_sheet_id=master["sheet_id"],
            data_inicial=str(payload.get("data_inicial") or ""),
            data_final=str(payload.get("data_final") or ""),
            stores=list(payload.get("stores") or []),
        )
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@app.post("/api/exportMetabaseSalesXlsx")
def api_export_metabase_sales_xlsx(req: ScriptRequest) -> JSONResponse:
    payload = req.args[0] if req.args else {}
    if not isinstance(payload, dict):
        payload = {}

    try:
        sales_result = fetch_card_823_rows_result(
            data_inicial=str(payload.get("data_inicial") or ""),
            data_final=str(payload.get("data_final") or ""),
            loja=str(payload.get("loja") or ""),
            cod_loja=str(payload.get("cod_loja") or ""),
        )
        resolved_store = str(sales_result.get("loja") or "")
        rows = list(sales_result.get("rows") or [])
        export_dir = APP_ROOT / "outputs" / "metabase_exports"
        export_name = (
            f"vendas_{resolved_store}_{str(payload.get('data_inicial') or '').strip()}_{str(payload.get('data_final') or '').strip()}.xlsx"
            .replace("/", "-")
            .replace(" ", "_")
        )
        output_path = write_metabase_rows_to_xlsx(rows, export_dir / export_name)
        return JSONResponse(
            {
                "success": True,
                "rows_fetched_raw": len(rows),
                "loja": resolved_store,
                "data_inicial_effective": sales_result.get("data_inicial_effective"),
                "data_final_effective": sales_result.get("data_final_effective"),
                "fallback_applied": sales_result.get("fallback_applied"),
                "fallback_reason": sales_result.get("fallback_reason"),
                "fallback_date": sales_result.get("fallback_date"),
                "output_path": str(output_path),
                "download_url": f"/api/file?path={quote(str(output_path))}",
            }
        )
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@app.get("/api/file")
def api_file(path: str) -> FileResponse:
    candidate = Path(path).expanduser().resolve()
    if not candidate.exists() or not candidate.is_file():
        raise FileNotFoundError("Arquivo não encontrado.")
    return FileResponse(candidate)


@app.post("/api/generateSlotsFromCadastro")
def api_generate_slots_from_cadastro(req: ScriptRequest) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha ALVO primeiro."})
    clear_existing = True
    if req.args:
        clear_existing = bool(req.args[0])
    master = get_workflow_sheet("master")
    master_id = master.get("sheet_id") if master else None
    result = generate_slots_from_cadastro_gsheet(
        active["sheet_id"],
        clear_existing=clear_existing,
        master_sheet_id=master_id,
    )
    return JSONResponse(result)


@app.post("/api/getEtlMappingOptions")
def api_get_etl_mapping_options(_: ScriptRequest | None = None) -> JSONResponse:
    master = get_workflow_sheet("master")
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha ETL primeiro."})
    result = get_etl_mapping_options(master["sheet_id"])
    return JSONResponse(result)


@app.post("/api/saveEtlWarningMappings")
def api_save_etl_warning_mappings(req: ScriptRequest) -> JSONResponse:
    master = get_workflow_sheet("master")
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha ETL primeiro."})
    warning_type = req.args[0] if len(req.args) > 0 else ""
    updates = req.args[1] if len(req.args) > 1 else []
    result = save_etl_warning_mappings(master["sheet_id"], warning_type, updates)
    return JSONResponse(result)


@app.post("/api/sendEtlWarningGroup")
def api_send_etl_warning_group(req: ScriptRequest) -> JSONResponse:
    target = _require_active_sheet()
    if not target:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    master = get_workflow_sheet("master")
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha ETL primeiro."})
    warning_type = req.args[0] if len(req.args) > 0 else ""
    result = send_warning_group_to_etl(master["sheet_id"], target["sheet_id"], warning_type)
    return JSONResponse(result)


@app.post("/api/sendMissingVolumetriaDefault")
def api_send_missing_volumetria_default(req: ScriptRequest) -> JSONResponse:
    target = _require_active_sheet()
    if not target:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    master = get_workflow_sheet("master")
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha ETL primeiro."})
    default_volume_cm3 = req.args[0] if len(req.args) > 0 else None
    result = send_missing_volumetria_with_default(
        master["sheet_id"],
        target["sheet_id"],
        default_volume_cm3,
    )
    return JSONResponse(result)


@app.post("/api/sanitizeMixDuplicates")
def api_sanitize_mix_duplicates(_: ScriptRequest | None = None) -> JSONResponse:
    target = _require_active_sheet()
    if not target:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    mix = get_workflow_sheet("mix")
    if not mix or not mix.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha MIX primeiro."})
    result = sanitize_mix_duplicates(mix["sheet_id"], target_sheet_id=target["sheet_id"])
    return JSONResponse(result)


@app.post("/api/refreshEtlWarning")
def api_refresh_etl_warning(req: ScriptRequest) -> JSONResponse:
    warning_type = req.args[0] if len(req.args) > 0 else ""
    target = _require_active_sheet()
    if not target:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    master = get_workflow_sheet("master")
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha ETL primeiro."})
    mix = get_workflow_sheet("mix")
    if not mix or not mix.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha MIX primeiro."})
    result = refresh_single_etl_warning(
        master_sheet_id=master["sheet_id"],
        mix_sheet_id=mix["sheet_id"],
        target_sheet_id=target["sheet_id"],
        warning_type=warning_type,
    )
    return JSONResponse(result)


@app.post("/api/addNewProduct")
def api_add_new_product(req: ScriptRequest) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha ALVO primeiro."})
    product = req.args[0] if req.args else {}
    result = add_new_product_gsheet(active["sheet_id"], product)
    return JSONResponse(result)


@app.post("/api/updateBaseProduct")
def api_update_base_product(req: ScriptRequest) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha ALVO primeiro."})
    original_code = req.args[0] if len(req.args) > 0 else ""
    product = req.args[1] if len(req.args) > 1 else {}
    result = update_base_product_gsheet(active["sheet_id"], original_code, product)
    return JSONResponse(result)


@app.post("/api/generateSkuReportCustom")
def api_generate_sku_report_custom(req: ScriptRequest) -> JSONResponse:
    destination = req.args[0] if len(req.args) > 0 else "same"
    abas = req.args[1] if len(req.args) > 1 else []
    colunas = req.args[2] if len(req.args) > 2 else []
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    result = generate_sku_report_custom_gsheet(active["sheet_id"], destination, abas, colunas)
    return JSONResponse(result)


@app.post("/api/exportFilteredUnallocatedXlsx")
def api_export_filtered_unallocated_xlsx(req: ScriptRequest) -> JSONResponse:
    destination = str(req.args[0]).strip().lower() if len(req.args) > 0 else "new"
    rows = req.args[1] if len(req.args) > 1 else []
    requested_name = str(req.args[2]).strip() if len(req.args) > 2 else "Relatório Não Endereçados"
    if not isinstance(rows, list):
        rows = []

    default_headers = [
        "codigo_sku",
        "descricao",
        "categoria_armazenagem",
        "tipo_filtro",
        "grupo",
        "subcategoria",
        "quantidade",
        "curva",
        "vendas",
    ]
    headers = default_headers
    if rows and isinstance(rows[0], dict):
        first_keys = list(rows[0].keys())
        if first_keys:
            headers = first_keys

    normalized_rows: list[list[Any]] = []
    for row in rows:
        if isinstance(row, dict):
            normalized_rows.append([row.get(h, "") for h in headers])
        elif isinstance(row, list):
            normalized_rows.append(row)

    if destination == "same":
        active = _require_active_sheet()
        if not active:
            return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
        sheet_name = (requested_name or "Relatório Não Endereçados").strip()[:90]
        client = GSheetsClient(active["sheet_id"])
        client.ensure_sheet(sheet_name)
        client.clear_sheet(sheet_name)
        client.append_rows(sheet_name, [headers] + normalized_rows)
        return JSONResponse(
            {
                "success": True,
                "mode": "same",
                "sheetName": sheet_name,
                "sheetUrl": client.get_sheet_url(sheet_name),
                "rowsWritten": len(normalized_rows),
            }
        )

    wb = Workbook()
    ws = wb.active
    ws.title = "Nao_Enderecados"
    ws.append(headers)
    for row in normalized_rows:
        ws.append(row)

    buffer = io.BytesIO()
    wb.save(buffer)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    filename = f"Relatorio_Nao_Enderecados_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return JSONResponse(
        {
            "success": True,
            "mode": "new",
            "filename": filename,
            "xlsxBase64": encoded,
            "rowsWritten": len(normalized_rows),
        }
    )


@app.post("/api/getProductByBarcode")
def api_get_product_by_barcode(req: ScriptRequest) -> JSONResponse:
    barcode = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    result = get_product_by_barcode_gsheet(active["sheet_id"], barcode)
    return JSONResponse(result)


@app.post("/api/removeAllProductsByFilter")
def api_remove_all_products_by_filter(req: ScriptRequest) -> JSONResponse:
    filter_key = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if active:
        result = remove_all_products_by_filter_gsheet(active["sheet_id"], filter_key)
        return JSONResponse(result)
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        result = remove_all_products_by_filter_xlsx(DATA_XLSX_PATH, filter_key)
        return JSONResponse(result)
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@app.post("/api/previewRemoveAllProductsByFilter")
def api_preview_remove_all_products_by_filter(req: ScriptRequest) -> JSONResponse:
    filter_key = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if active:
        result = preview_remove_all_products_by_filter_gsheet(active["sheet_id"], filter_key)
        return JSONResponse(result)
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        result = preview_remove_all_products_by_filter_xlsx(DATA_XLSX_PATH, filter_key)
        return JSONResponse(result)
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@app.post("/api/savePlanoVersion")
def api_save_plano_version(req: ScriptRequest) -> JSONResponse:
    name = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if active:
        result = save_plano_version_gsheet(active["sheet_id"], name)
        return JSONResponse(result)
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        result = save_plano_version_xlsx(DATA_XLSX_PATH, name)
        return JSONResponse(result)
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@app.post("/api/listPlanoVersions")
def api_list_plano_versions(_: ScriptRequest | None = None) -> JSONResponse:
    active = _require_active_sheet()
    if active:
        result = list_plano_versions_gsheet(active["sheet_id"])
        return JSONResponse(result)
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        result = list_plano_versions_xlsx(DATA_XLSX_PATH)
        return JSONResponse(result)
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@app.post("/api/restorePlanoVersion")
def api_restore_plano_version(req: ScriptRequest) -> JSONResponse:
    version_id = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if active:
        result = restore_plano_version_gsheet(active["sheet_id"], version_id)
        return JSONResponse(result)
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        result = restore_plano_version_xlsx(DATA_XLSX_PATH, version_id)
        return JSONResponse(result)
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@app.post("/api/deletePlanoVersion")
def api_delete_plano_version(req: ScriptRequest) -> JSONResponse:
    version_id = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if active:
        result = delete_plano_version_gsheet(active["sheet_id"], version_id)
        return JSONResponse(result)
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        result = delete_plano_version_xlsx(version_id)
        return JSONResponse(result)
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@app.post("/api/{func_name}")
def api_not_implemented(func_name: str, _: ScriptRequest | None = None) -> JSONResponse:
    return JSONResponse(
        {
            "success": False,
            "error": f"Função '{func_name}' não disponível no modo local.",
        }
    )
