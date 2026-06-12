from __future__ import annotations

from typing import Any

from backend.ports.sheet_gateway import SheetGateway


def run_etl(
    target_sheet_id: str,
    master_sheet_id: str,
    mix_sheet_id: str,
    gateway: SheetGateway,  # noqa: ARG001 — reservado para futura substituição
) -> dict[str, Any]:
    """Executa o pipeline ETL de enriquecimento de catálogo.

    Wrapper sobre core.enrichment_pipeline.run_etl_to_base_products.

    Args:
        target_sheet_id: ID da planilha de endereçamento destino.
        master_sheet_id: ID da planilha master com dados de referência.
        mix_sheet_id: ID da planilha de mix de produtos.
        gateway: Gateway de planilhas (reservado).

    Returns:
        Dicionário com resultado do ETL (success, rows_written, warnings, etc.).
    """
    from core.enrichment_pipeline import run_etl_to_base_products
    return run_etl_to_base_products(
        master_sheet_id=master_sheet_id,
        mix_sheet_id=mix_sheet_id,
        target_sheet_id=target_sheet_id,
    )
