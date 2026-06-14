"""Rotas de ETL, pipeline de enriquecimento e vendas Metabase."""
from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import JSONResponse

from core.enrichment_pipeline import (
    refresh_single_etl_warning,
    run_etl_to_base_products,
    sanitize_mix_duplicates,
)
from core.etl_warning_mappings import (
    get_etl_mapping_options,
    save_etl_warning_mappings,
    send_missing_volumetria_with_default,
    send_warning_group_to_etl,
)
from core.gsheets_backend import generate_slots_from_cadastro_gsheet
from core.gsheets_client import GSheetsClient
from core.metabase_sales import (
    build_vendas_alvo_from_metabase,
    fetch_card_823_rows_result,
    write_metabase_rows_to_xlsx,
)
from core.workflow_context import get_workflow_sheet
from routes._state import APP_ROOT, ScriptRequest, _require_active_sheet

router = APIRouter()


def _run_etl_legacy_job(job_service, job_id: str, target_sheet_id: str, master_sheet_id: str, mix_sheet_id: str) -> None:
    """Executado em background — wrapper legado do ETL."""
    try:
        job_service.update(job_id, "running")
        result = run_etl_to_base_products(
            master_sheet_id=master_sheet_id,
            mix_sheet_id=mix_sheet_id,
            target_sheet_id=target_sheet_id,
        )
        if result.get("success"):
            try:
                tc = GSheetsClient(target_sheet_id)
                sheet_names = tc.list_sheet_names()
                plano_values = (
                    tc.read_values("Plano_Enderecamento_Final")
                    if "Plano_Enderecamento_Final" in sheet_names
                    else []
                )
                if not plano_values or len(plano_values) < 2:
                    slots = generate_slots_from_cadastro_gsheet(
                        target_sheet_id, clear_existing=True, master_sheet_id=master_sheet_id
                    )
                    if slots.get("success"):
                        result["plano_auto_generated"] = True
                        result["slots_generated"] = slots.get("slots_generated", 0)
                        result["plano_sheet_url"] = slots.get("plano_sheet_url")
                    else:
                        result["plano_auto_warning"] = (
                            slots.get("error") or "Não foi possível gerar Plano_Enderecamento_Final automaticamente."
                        )
            except Exception as slot_exc:
                result["plano_auto_warning"] = str(slot_exc)
        job_service.update(job_id, "done", result=result)
    except Exception as exc:
        job_service.update(job_id, "failed", error=str(exc))


@router.post("/api/runEtlToBaseProducts")
async def api_run_etl_to_base_products(
    background_tasks: BackgroundTasks, _: ScriptRequest | None = None
) -> JSONResponse:
    from backend.application.jobs.job_service import JobService  # noqa: PLC0415
    job_service = JobService()

    target = _require_active_sheet()
    master = get_workflow_sheet("master")
    mix = get_workflow_sheet("mix")
    if not target:
        return JSONResponse({"success": False, "error": "Conecte a planilha ALVO primeiro."})
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha MÃE (ETL) primeiro."})
    if not mix or not mix.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha MIX primeiro."})
    job_id = job_service.enqueue(
        "etl_legacy",
        payload={"target": target["sheet_id"], "master": master["sheet_id"], "mix": mix["sheet_id"]},
    )
    background_tasks.add_task(
        _run_etl_legacy_job, job_service, job_id, target["sheet_id"], master["sheet_id"], mix["sheet_id"]
    )
    return JSONResponse({"success": True, "job_id": job_id, "status": "pending"})


@router.post("/api/buildMetabaseSalesTarget")
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


@router.post("/api/exportMetabaseSalesXlsx")
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


@router.post("/api/getEtlMappingOptions")
def api_get_etl_mapping_options(_: ScriptRequest | None = None) -> JSONResponse:
    master = get_workflow_sheet("master")
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha ETL primeiro."})
    return JSONResponse(get_etl_mapping_options(master["sheet_id"]))


@router.post("/api/saveEtlWarningMappings")
def api_save_etl_warning_mappings(req: ScriptRequest) -> JSONResponse:
    master = get_workflow_sheet("master")
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha ETL primeiro."})
    warning_type = req.args[0] if len(req.args) > 0 else ""
    updates = req.args[1] if len(req.args) > 1 else []
    return JSONResponse(save_etl_warning_mappings(master["sheet_id"], warning_type, updates))


@router.post("/api/sendEtlWarningGroup")
def api_send_etl_warning_group(req: ScriptRequest) -> JSONResponse:
    target = _require_active_sheet()
    if not target:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    master = get_workflow_sheet("master")
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha ETL primeiro."})
    warning_type = req.args[0] if len(req.args) > 0 else ""
    return JSONResponse(send_warning_group_to_etl(master["sheet_id"], target["sheet_id"], warning_type))


@router.post("/api/sendMissingVolumetriaDefault")
def api_send_missing_volumetria_default(req: ScriptRequest) -> JSONResponse:
    target = _require_active_sheet()
    if not target:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    master = get_workflow_sheet("master")
    if not master or not master.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha ETL primeiro."})
    default_volume_cm3 = req.args[0] if len(req.args) > 0 else None
    return JSONResponse(send_missing_volumetria_with_default(master["sheet_id"], target["sheet_id"], default_volume_cm3))


@router.post("/api/sanitizeMixDuplicates")
def api_sanitize_mix_duplicates(_: ScriptRequest | None = None) -> JSONResponse:
    target = _require_active_sheet()
    if not target:
        return JSONResponse({"success": False, "error": "Conecte a planilha de Endereçamento primeiro."})
    mix = get_workflow_sheet("mix")
    if not mix or not mix.get("sheet_id"):
        return JSONResponse({"success": False, "error": "Conecte a planilha MIX primeiro."})
    return JSONResponse(sanitize_mix_duplicates(mix["sheet_id"], target_sheet_id=target["sheet_id"]))


@router.post("/api/refreshEtlWarning")
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
    return JSONResponse(
        refresh_single_etl_warning(
            master_sheet_id=master["sheet_id"],
            mix_sheet_id=mix["sheet_id"],
            target_sheet_id=target["sheet_id"],
            warning_type=warning_type,
        )
    )
