from __future__ import annotations

from typing import Any

from .excel_io import read_sheet
from .utils import normalize_string

SHEET_BARCODE = "Código de barras produtos"


def get_product_by_barcode(source: Any, barcode: str) -> dict[str, Any]:
    try:
        if hasattr(source, "read_sheet"):
            data = source.read_sheet(SHEET_BARCODE)
        else:
            data = read_sheet(source, SHEET_BARCODE)
    except Exception:
        return {"success": False, "error": "Aba de códigos de barras não encontrada"}

    search = normalize_string(barcode)
    if not search:
        return {"success": False, "error": "Código de barras vazio"}

    for row in data:
        barcode_value = normalize_string(row.get("barcode") or row.get("cod_produto"))
        if barcode_value == search:
            return {
                "success": True,
                "product": {
                    "cod_produto": row.get("cod_produto") or "",
                    "nome": row.get("nome") or "",
                    "categoria": row.get("categoria") or "",
                },
            }
    return {"success": False, "error": "Produto não encontrado com este código de barras"}
