from __future__ import annotations

from typing import Any

from backend.ports.sheet_gateway import SheetGateway


def restore_version(
    sheet_id: str,
    version_id: str,
    gateway: SheetGateway,  # noqa: ARG001 — reservado para futura substituição
) -> dict[str, Any]:
    """Restaura uma versão salva do plano de endereçamento.

    Wrapper sobre core.gsheets_backend.restore_plano_version_gsheet.

    Args:
        sheet_id: ID da planilha de endereçamento.
        version_id: Identificador da versão a restaurar.
        gateway: Gateway de planilhas (reservado).

    Returns:
        Dicionário com resultado da restauração.
    """
    from core.gsheets_backend import restore_plano_version_gsheet
    return restore_plano_version_gsheet(sheet_id, version_id)
