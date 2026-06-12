from __future__ import annotations

from typing import Any

from backend.ports.sheet_gateway import SheetGateway


def list_versions(
    sheet_id: str,
    gateway: SheetGateway,  # noqa: ARG001 — reservado para futura substituição
) -> dict[str, Any]:
    """Lista todas as versões salvas do plano de endereçamento.

    Wrapper sobre core.gsheets_backend.list_plano_versions_gsheet.

    Args:
        sheet_id: ID da planilha de endereçamento.
        gateway: Gateway de planilhas (reservado).

    Returns:
        Dicionário com a lista de versões disponíveis.
    """
    from core.gsheets_backend import list_plano_versions_gsheet
    return list_plano_versions_gsheet(sheet_id)
