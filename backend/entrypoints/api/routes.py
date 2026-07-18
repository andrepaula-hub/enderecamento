from __future__ import annotations

import importlib.metadata
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.adapters.google_sheets.sheets_adapter import GoogleSheetsAdapter
from backend.adapters.sqlite.workflow_repo import SQLiteWorkflowRepository
from backend.application.jobs.job_service import JobService

router = APIRouter()

# Singletons leves — não abrem conexões até serem usados
_gateway = GoogleSheetsAdapter()
_repo = SQLiteWorkflowRepository()
_job_service = JobService()


# ---------------------------------------------------------------------------
# Modelos de request
# ---------------------------------------------------------------------------

class ConnectSheetsRequest(BaseModel):
    target_link: str = ""
    master_link: str = ""
    mix_link: str = ""


class SaveMovesRequest(BaseModel):
    sheet_id: str = ""
    moves: list[dict[str, Any]] = []
    skip_full: bool = False


class SaveVersionRequest(BaseModel):
    sheet_id: str = ""
    name: str = ""


class RestoreVersionRequest(BaseModel):
    sheet_id: str = ""


class RunEtlRequest(BaseModel):
    target_sheet_id: str = ""
    master_sheet_id: str = ""
    mix_sheet_id: str = ""


class KdabraRequest(BaseModel):
    sheet_id: str = ""


class SuggestAllocationsRequest(BaseModel):
    unallocated_codes: list[str] = []
    products_data: list[dict[str, Any]] = []
    map_structure: list[dict[str, Any]] = []
    allocations: dict[str, dict[str, str | None]] = {}
    options: dict[str, Any] = {}


class FillStreetRequest(SuggestAllocationsRequest):
    target_groups: list[dict[str, Any]] = []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _active_sheet_id() -> str | None:
    """Retorna o target_sheet_id do workflow ativo."""
    workflow = _repo.get_active()
    if workflow and workflow.target_sheet_id:
        return workflow.target_sheet_id
    # fallback para core (compatibilidade)
    from core.gsheets_client import get_active_sheet
    active = get_active_sheet()
    return active.get("sheet_id") if active else None


def _active_master_id() -> str | None:
    from core.workflow_context import get_workflow_sheet
    master = get_workflow_sheet("master")
    return master.get("sheet_id") if master else None


# ---------------------------------------------------------------------------
# Rotas
# ---------------------------------------------------------------------------

@router.post("/api/workflows/connect-sheets")
def new_connect_sheets(req: ConnectSheetsRequest) -> JSONResponse:
    from backend.application.workflow.connect_sheets import connect_workflow_sheets
    try:
        result = connect_workflow_sheets(
            target_link=req.target_link,
            master_link=req.master_link,
            mix_link=req.mix_link,
            repo=_repo,
            gateway=_gateway,
        )
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.get("/api/workflows/active")
def new_get_active_workflow() -> JSONResponse:
    try:
        workflow = _repo.get_active()
        if workflow:
            return JSONResponse({
                "success": True,
                "target_sheet_id": workflow.target_sheet_id,
                "master_sheet_id": workflow.master_sheet_id,
                "mix_sheet_id": workflow.mix_sheet_id,
                "target_title": workflow.target_title,
                "master_title": workflow.master_title,
                "mix_title": workflow.mix_title,
            })
        # fallback para core
        from core.gsheets_client import get_active_sheet
        from core.workflow_context import get_workflow_context
        active = get_active_sheet()
        ctx = get_workflow_context()
        return JSONResponse({
            "success": True,
            "target": active,
            "master": ctx.get("master"),
            "mix": ctx.get("mix"),
        })
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.get("/api/addressing/state")
def new_get_addressing_state(sheet_id: str = "", master_sheet_id: str = "") -> JSONResponse:
    from backend.application.addressing.load_state import load_addressing_state
    sid = sheet_id or _active_sheet_id() or ""
    mid = master_sheet_id or _active_master_id() or None
    if not sid:
        return JSONResponse({"error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    try:
        return JSONResponse(load_addressing_state(sid, mid, _gateway))
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/addressing/moves")
def new_save_moves(req: SaveMovesRequest) -> JSONResponse:
    from backend.application.addressing.save_moves import save_moves
    sid = req.sheet_id or _active_sheet_id() or ""
    if not sid:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa."})
    try:
        return JSONResponse(save_moves(sid, req.moves, req.skip_full, _gateway))
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.get("/api/addressing/versions")
def new_list_versions(sheet_id: str = "") -> JSONResponse:
    from backend.application.versioning.list_versions import list_versions
    sid = sheet_id or _active_sheet_id() or ""
    if not sid:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa."})
    try:
        return JSONResponse(list_versions(sid, _gateway))
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/addressing/versions")
def new_save_version(req: SaveVersionRequest) -> JSONResponse:
    from backend.application.versioning.save_version import save_version
    sid = req.sheet_id or _active_sheet_id() or ""
    if not sid:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa."})
    try:
        return JSONResponse(save_version(sid, req.name, _gateway))
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/addressing/versions/{version_id}/restore")
def new_restore_version(version_id: str, req: RestoreVersionRequest) -> JSONResponse:
    from backend.application.versioning.restore_version import restore_version
    sid = req.sheet_id or _active_sheet_id() or ""
    if not sid:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa."})
    try:
        return JSONResponse(restore_version(sid, version_id, _gateway))
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


def _run_etl_job(job_id: str, target: str, master: str, mix: str) -> None:
    """Executado em background — atualiza o job no SQLite ao fim."""
    from backend.application.catalog_etl.run_etl import run_etl
    try:
        _job_service.update(job_id, "running")
        result = run_etl(target, master, mix, _gateway)
        _job_service.update(job_id, "done", result=result)
    except Exception as exc:
        _job_service.update(job_id, "failed", error=str(exc))


@router.post("/api/etl/run")
async def new_run_etl(req: RunEtlRequest, background_tasks: BackgroundTasks) -> JSONResponse:
    # fallback para contexto ativo se não fornecido
    target = req.target_sheet_id or _active_sheet_id() or ""
    master = req.master_sheet_id or _active_master_id() or ""
    mix = req.mix_sheet_id
    if not (target and master):
        return JSONResponse({"success": False, "error": "target_sheet_id e master_sheet_id são obrigatórios."})
    job_id = _job_service.enqueue("etl", payload={"target": target, "master": master, "mix": mix})
    background_tasks.add_task(_run_etl_job, job_id, target, master, mix)
    return JSONResponse({"job_id": job_id, "status": "pending"})


@router.get("/api/jobs/{job_id}")
async def get_job_status(job_id: str) -> JSONResponse:
    job = _job_service.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job não encontrado")
    return JSONResponse(job)


@router.post("/api/exports/kdabra")
def new_generate_kdabra(req: KdabraRequest) -> JSONResponse:
    from backend.application.exports.generate_kdabra import generate_kdabra
    sid = req.sheet_id or _active_sheet_id() or ""
    if not sid:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa."})
    try:
        return JSONResponse(generate_kdabra(sid, _gateway))
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.get("/health")
async def health() -> JSONResponse:
    try:
        version = importlib.metadata.version("fastapi")
    except Exception:
        version = "unknown"
    return JSONResponse({"status": "ok", "service": "enderecamento", "fastapi_version": version})


@router.post("/api/addressing/suggest")
def new_suggest_allocations(req: SuggestAllocationsRequest) -> JSONResponse:
    from backend.application.addressing.suggest_allocations import suggest_allocations
    try:
        result = suggest_allocations(
            unallocated_codes=req.unallocated_codes,
            products_data=req.products_data,
            map_structure=req.map_structure,
            allocations=req.allocations,
            options=req.options,
        )
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.post("/api/addressing/fill-street")
def new_fill_street_allocations(req: FillStreetRequest) -> JSONResponse:
    from backend.application.addressing.fill_street import fill_street_allocations
    try:
        result = fill_street_allocations(
            unallocated_codes=req.unallocated_codes,
            products_data=req.products_data,
            map_structure=req.map_structure,
            allocations=req.allocations,
            target_groups=req.target_groups,
            options=req.options,
        )
        return JSONResponse(result)
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)})


@router.get("/api/stores")
def new_list_stores() -> JSONResponse:
    """Retorna as lojas atualmente disponíveis no Card 823."""
    from core.metabase_sales import get_metabase_sales_context
    available = get_metabase_sales_context()["available_stores"]
    stores = [{"id": s["value"], "nome": s["label"]} for s in available]
    return JSONResponse({"success": True, "stores": stores})
