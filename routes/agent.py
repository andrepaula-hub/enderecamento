"""Rotas do agente de endereçamento automático e importação do card de estoque."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from core.agent_tools import (
    apply_auto_address,
    auto_address_preview,
    infer_metabase_store_id,
    infer_store_context,
    validate_plan,
)
from core.card175_snapshot import import_card175_rows, import_card175_snapshot
from core.enrichment_pipeline import run_etl_to_base_products
from core.gsheets_backend import generate_slots_from_cadastro_gsheet
from core.gsheets_client import GSheetsClient, set_active_sheet
from core.metabase_sales import (
    CARD175_CARD_ID,
    CARD175_STORE_CODE_BY_ID,
    DEFAULT_METABASE_URL,
    STORE_OPTIONS,
    build_vendas_alvo_from_metabase,
    extract_metabase_card_id,
    metabase_query_card,
    resolve_metabase_session,
)
from core.workflow_context import get_workflow_sheet, set_workflow_sheet
from routes._state import (
    AGENT_MASTER_SHEET_LINK,
    ScriptRequest,
    _require_active_sheet,
    _require_agent_prepared,
    _write_agent_workflow_status,
)

router = APIRouter()


@router.post("/api/agent/inferStoreContext")
def api_agent_infer_store_context(_: ScriptRequest | None = None) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    try:
        return JSONResponse(infer_store_context(active["sheet_id"]))
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/agent/prepareWorkflow")
def api_agent_prepare_workflow(req: ScriptRequest) -> JSONResponse:
    payload = req.args[0] if req.args else {}
    if not isinstance(payload, dict):
        payload = {}

    target_link = str(payload.get("target_link") or payload.get("enderecamento_link") or "").strip()
    mix_link = str(payload.get("mix_link") or "").strip()
    master_link = str(payload.get("master_link") or AGENT_MASTER_SHEET_LINK).strip()
    data_inicial = str(payload.get("data_inicial") or payload.get("sales_start") or "").strip()
    data_final = str(payload.get("data_final") or payload.get("sales_end") or "").strip()
    stores = [str(item).strip() for item in (payload.get("stores") or []) if str(item).strip()]
    run_sales = bool(payload.get("run_sales", True))
    run_etl = bool(payload.get("run_etl", True))
    generate_slots_if_needed = bool(payload.get("generate_slots_if_needed", True))
    steps: list[dict[str, Any]] = []

    if not target_link:
        return JSONResponse({"success": False, "error": "Informe target_link da planilha de Endereçamento."})
    if not mix_link:
        return JSONResponse({"success": False, "error": "Informe mix_link da planilha de Mix."})
    if not master_link:
        return JSONResponse(
            {"success": False, "error": "Planilha ETL mãe fixa não configurada. Defina ENDERECAMENTO_MASTER_SHEET no ambiente ou envie master_link."}
        )

    try:
        target_info = set_active_sheet(target_link)
        steps.append({"step": "connect_target", "success": True, "sheet": target_info})
        master_info = set_workflow_sheet("master", master_link)
        steps.append({"step": "connect_master", "success": True, "sheet": master_info})
        mix_info = set_workflow_sheet("mix", mix_link)
        steps.append({"step": "connect_mix", "success": True, "sheet": mix_info})

        context = infer_store_context(target_info["sheet_id"])
        store_name = str(context.get("store_name") or "")
        if not stores:
            inferred_store = infer_metabase_store_id(store_name, STORE_OPTIONS)
            if inferred_store:
                stores = [inferred_store]
        steps.append({"step": "infer_store", "success": True, "store_name": store_name, "stores": stores})

        sales_result = None
        if run_sales:
            if not data_inicial or not data_final:
                return JSONResponse(
                    {"success": False, "error": "Informe data_inicial e data_final para montar Vendas Alvo.", "steps": steps}
                )
            if not stores:
                return JSONResponse(
                    {"success": False, "error": "Não consegui inferir a loja para o Metabase. Envie stores explicitamente.", "steps": steps}
                )
            sales_result = build_vendas_alvo_from_metabase(
                master_sheet_id=master_info["sheet_id"],
                data_inicial=data_inicial,
                data_final=data_final,
                stores=stores,
            )
            steps.append({"step": "build_sales_target", "success": bool(sales_result.get("success")), "result": sales_result})

        slots_result = None
        slots_ready = False
        if generate_slots_if_needed:
            try:
                values = GSheetsClient(target_info["sheet_id"]).read_values("Plano_Enderecamento_Final")
                plan_ready = bool(values and len(values) > 1)
            except Exception:
                plan_ready = False
            if plan_ready:
                slots_ready = True
                steps.append({"step": "generate_slots", "success": True, "skipped": True, "reason": "Plano já tinha escaninhos."})
            else:
                slots_result = generate_slots_from_cadastro_gsheet(
                    target_info["sheet_id"], clear_existing=True, master_sheet_id=master_info["sheet_id"]
                )
                slots_ready = bool(slots_result.get("success")) and int(slots_result.get("slots_generated") or 0) > 0
                steps.append({"step": "generate_slots", "success": slots_ready, "result": slots_result})
                if not slots_ready:
                    return JSONResponse(
                        {
                            "success": False,
                            "error": slots_result.get("error") or "Geração de escaninhos falhou ou gerou 0 slots.",
                            "steps": steps,
                        }
                    )
        else:
            slots_ready = True

        etl_result = None
        if run_etl:
            etl_result = run_etl_to_base_products(
                master_sheet_id=master_info["sheet_id"],
                mix_sheet_id=mix_info["sheet_id"],
                target_sheet_id=target_info["sheet_id"],
            )
            steps.append({"step": "run_etl", "success": bool(etl_result.get("success")), "result": etl_result})
            if not etl_result.get("success"):
                _write_agent_workflow_status(
                    {
                        "target_sheet_id": target_info["sheet_id"],
                        "master_sheet_id": master_info["sheet_id"],
                        "mix_sheet_id": mix_info["sheet_id"],
                        "slots_ready": slots_ready,
                        "etl_success": False,
                        "updated_at": datetime.now().isoformat(),
                    }
                )
                return JSONResponse({"success": False, "error": etl_result.get("error") or "ETL falhou.", "steps": steps})
        elif not payload.get("sales_already_in_base_products"):
            return JSONResponse(
                {
                    "success": False,
                    "error": "run_etl=false só é permitido quando sales_already_in_base_products=true. Caso contrário a prévia fica bloqueada.",
                    "steps": steps,
                }
            )

        etl_success = bool(etl_result.get("success")) if etl_result else bool(payload.get("sales_already_in_base_products"))
        _write_agent_workflow_status(
            {
                "target_sheet_id": target_info["sheet_id"],
                "master_sheet_id": master_info["sheet_id"],
                "mix_sheet_id": mix_info["sheet_id"],
                "slots_ready": slots_ready,
                "etl_success": etl_success,
                "run_etl": run_etl,
                "updated_at": datetime.now().isoformat(),
            }
        )
        return JSONResponse(
            {
                "success": True,
                "target": target_info,
                "master": master_info,
                "mix": mix_info,
                "store_name": store_name,
                "stores": stores,
                "sales": sales_result,
                "etl": etl_result,
                "slots": slots_result,
                "steps": steps,
            }
        )
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc), "steps": steps})


@router.post("/api/agent/validatePlan")
def api_agent_validate_plan(req: ScriptRequest) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    payload = req.args[0] if req.args else {}
    if not isinstance(payload, dict):
        payload = {}
    try:
        result = validate_plan(
            active["sheet_id"],
            chemical_equipment_ids=list(payload.get("chemical_equipment_ids") or []),
        )
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/agent/autoAddressPreview")
def api_agent_auto_address_preview(req: ScriptRequest) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    payload = req.args[0] if req.args else {}
    if not isinstance(payload, dict):
        payload = {}
    if not bool(payload.get("skip_prepare_check", False)):
        prepared_error = _require_agent_prepared(active["sheet_id"])
        if prepared_error:
            return JSONResponse(prepared_error)
    try:
        result = auto_address_preview(
            active["sheet_id"],
            chemical_equipment_ids=list(payload.get("chemical_equipment_ids") or []),
            allow_top_level=bool(payload.get("allow_top_level", False)),
            allow_second_slot=bool(payload.get("allow_second_slot", False)),
            scope=payload.get("scope") if isinstance(payload.get("scope"), dict) else None,
            curve_zones=payload.get("curve_zones") if isinstance(payload.get("curve_zones"), dict) else None,
        )
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/agent/applyAutoAddress")
def api_agent_apply_auto_address(req: ScriptRequest) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    payload = req.args[0] if req.args else {}
    if not isinstance(payload, dict):
        payload = {}
    moves = payload.get("moves") or payload.get("proposed_moves") or []
    if not isinstance(moves, list):
        moves = []
    try:
        result = apply_auto_address(
            active["sheet_id"],
            moves,
            user=str(payload.get("user") or "agent"),
            version_name=str(payload.get("version_name") or "").strip() or None,
            export_kdabra=bool(payload.get("export_kdabra", False)),
        )
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/importCard175Snapshot")
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


@router.post("/api/importCard175Metabase")
def api_import_card175_metabase(req: ScriptRequest) -> JSONResponse:
    payload = req.args[0] if req.args else {}
    if not isinstance(payload, dict):
        payload = {}
    try:
        sheet_link = str(payload.get("sheet_link") or "").strip()
        card_ref = str(payload.get("card_ref") or payload.get("card_id") or CARD175_CARD_ID).strip()
        store_code = str(payload.get("store_code") or payload.get("storeCode") or "").strip()
        galpao = str(payload.get("galpao") or "").strip()
        if not sheet_link:
            return JSONResponse({"success": False, "error": "Informe o link/ID da planilha de mapeamento."})
        if not store_code and galpao:
            for candidate_store, candidate_code in CARD175_STORE_CODE_BY_ID.items():
                if candidate_store.lower() == galpao.lower() or str(candidate_code).strip().upper() == galpao.upper():
                    store_code = str(candidate_code).strip()
                    break
        if not store_code:
            return JSONResponse({"success": False, "error": "Informe fulfillment_center_id da loja para consultar o Card 788."})

        active_info = set_active_sheet(sheet_link)
        card_id = extract_metabase_card_id(card_ref)
        rows = metabase_query_card(
            base_url=DEFAULT_METABASE_URL,
            card_id=card_id,
            session_id=resolve_metabase_session(timeout_seconds=60),
            parameters=[
                {
                    "type": "category",
                    "target": ["variable", ["template-tag", "fulfillment_center_id"]],
                    "value": store_code,
                }
            ],
            timeout_seconds=120,
        )
        master = get_workflow_sheet("master")
        master_sheet_id = master["sheet_id"] if master else None
        result = import_card175_rows(
            sheet_id=active_info["sheet_id"],
            rows=rows,
            source_name=f"metabase_card_{card_id}",
            user="local",
            master_sheet_id=master_sheet_id,
        )
        if result.get("success"):
            result["sheet"] = active_info
            result["card_id"] = card_id
            result["store_code"] = store_code
            result["galpao"] = galpao
            result["rows_fetched_raw"] = len(rows)
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})
