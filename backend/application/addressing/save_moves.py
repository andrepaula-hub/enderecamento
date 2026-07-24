from __future__ import annotations

from typing import Any

from backend.ports.sheet_gateway import SheetGateway


def save_moves(
    sheet_id: str,
    moves: list[dict[str, Any]],
    skip_full: bool,
    gateway: SheetGateway,  # noqa: ARG001 — reservado para futura substituição
    allow_second_slot: bool = False,
) -> dict[str, Any]:
    """Persiste um lote de movimentações na planilha de endereçamento.

    Wrapper sobre core.gsheets_backend.save_batch_moves_gsheet.

    Args:
        sheet_id: ID da planilha de endereçamento.
        moves: Lista de movimentações a aplicar.
        skip_full: Se True, pula escaninhos já cheios.
        gateway: Gateway de planilhas (reservado).

    Returns:
        Dicionário com resultado da operação (success, moved, etc.).
    """
    from core.gsheets_backend import save_batch_moves_gsheet
    return save_batch_moves_gsheet(sheet_id, moves, skip_full=skip_full, allow_second_slot=allow_second_slot)
