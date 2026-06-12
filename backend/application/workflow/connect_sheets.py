from __future__ import annotations

from typing import Any

from backend.domain.workflow_sheet import WorkflowSheet
from backend.ports.sheet_gateway import SheetGateway
from backend.ports.workflow_repo import WorkflowRepository


def connect_workflow_sheets(
    target_link: str,
    master_link: str,
    mix_link: str,
    repo: WorkflowRepository,
    gateway: SheetGateway,
) -> dict[str, Any]:
    """Conecta as planilhas de endereçamento, master e mix ao fluxo de trabalho.

    Extrai os sheet_ids dos links, valida o acesso (via list_tabs) e persiste
    o WorkflowSheet no repositório, marcando-o como ativo.

    Args:
        target_link: Link ou ID da planilha de endereçamento.
        master_link: Link ou ID da planilha master.
        mix_link: Link ou ID da planilha de mix.
        repo: Repositório de workflows.
        gateway: Gateway de planilhas para validar acesso.

    Returns:
        Dicionário com success, e os sheet_ids conectados.
    """
    from core.gsheets_client import extract_sheet_id, set_active_sheet
    from core.workflow_context import set_workflow_sheet

    target_id = extract_sheet_id(target_link) if target_link else None
    master_id = extract_sheet_id(master_link) if master_link else None
    mix_id = extract_sheet_id(mix_link) if mix_link else None

    target_info: dict[str, Any] = {}
    master_info: dict[str, Any] = {}
    mix_info: dict[str, Any] = {}

    if target_link:
        target_info = set_active_sheet(target_link)
        target_id = target_info.get("sheet_id", "")
    if master_link:
        master_info = set_workflow_sheet("master", master_link)
    if mix_link:
        mix_info = set_workflow_sheet("mix", mix_link)

    workflow = WorkflowSheet(
        store_id="",
        target_sheet_id=str(target_id or ""),
        master_sheet_id=str(master_info.get("sheet_id") or master_id or ""),
        mix_sheet_id=str(mix_info.get("sheet_id") or mix_id or ""),
        target_title=str(target_info.get("title") or ""),
        master_title=str(master_info.get("title") or ""),
        mix_title=str(mix_info.get("title") or ""),
        is_active=True,
    )
    repo.save(workflow)
    repo.set_active(workflow.target_sheet_id)

    return {
        "success": True,
        "target": target_info or None,
        "master": master_info or None,
        "mix": mix_info or None,
    }
