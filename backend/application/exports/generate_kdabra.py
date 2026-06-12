from __future__ import annotations

from typing import Any

from backend.ports.sheet_gateway import SheetGateway


def generate_kdabra(
    sheet_id: str,
    gateway: SheetGateway,  # noqa: ARG001 — reservado para futura substituição
) -> dict[str, Any]:
    """Gera a aba de exportação Kdabra na planilha de endereçamento.

    Wrapper sobre core.gsheets_backend.generate_kdabra_sheet_gsheet.

    Args:
        sheet_id: ID da planilha de endereçamento.
        gateway: Gateway de planilhas (reservado).

    Returns:
        Dicionário com resultado da geração (success, rows, etc.).
    """
    from core.gsheets_backend import generate_kdabra_sheet_gsheet
    return generate_kdabra_sheet_gsheet(sheet_id)
