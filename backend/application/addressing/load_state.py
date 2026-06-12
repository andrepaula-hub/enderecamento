from __future__ import annotations

from typing import Any

from backend.ports.sheet_gateway import SheetGateway


def load_addressing_state(
    sheet_id: str,
    master_sheet_id: str | None,
    gateway: SheetGateway,  # noqa: ARG001 — reservado para futura substituição
) -> dict[str, Any]:
    """Carrega o estado atual do plano de endereçamento de uma planilha Google Sheets.

    Wrapper sobre core.gsheets_backend.get_initial_data_gsheet.
    O parâmetro gateway é injetado por conformidade com a arquitetura hexagonal;
    a implementação concreta ainda delega para o core enquanto a migração está em curso.

    Args:
        sheet_id: ID da planilha de endereçamento.
        master_sheet_id: ID da planilha master (opcional).
        gateway: Gateway de planilhas (reservado).

    Returns:
        Dicionário com o estado inicial do endereçamento.
    """
    from core.gsheets_backend import get_initial_data_gsheet
    return get_initial_data_gsheet(sheet_id, master_sheet_id=master_sheet_id)
