from __future__ import annotations

from typing import Any

from backend.ports.sheet_gateway import SheetGateway


def save_version(
    sheet_id: str,
    name: str,
    gateway: SheetGateway,  # noqa: ARG001 — reservado para futura substituição
) -> dict[str, Any]:
    """Salva uma versão nomeada do plano de endereçamento.

    Wrapper sobre core.gsheets_backend.save_plano_version_gsheet.

    Args:
        sheet_id: ID da planilha de endereçamento.
        name: Nome descritivo da versão.
        gateway: Gateway de planilhas (reservado).

    Returns:
        Dicionário com version_id e label da versão criada.
    """
    from core.gsheets_backend import save_plano_version_gsheet
    return save_plano_version_gsheet(sheet_id, name)
