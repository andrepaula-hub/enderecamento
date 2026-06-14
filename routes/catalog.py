"""Rotas de catálogo: produtos, buscas, relatórios e remoções em massa."""
from __future__ import annotations

import base64
import io
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from openpyxl import Workbook

from core.bulk_remove import (
    preview_remove_all_products_by_filter_xlsx,
    remove_all_products_by_filter_xlsx,
)
from core.gsheets_backend import (
    add_new_product_gsheet,
    generate_kdabra_enderecar_sheet_gsheet,
    generate_kdabra_sheet_gsheet,
    generate_sku_report_custom_gsheet,
    get_product_by_barcode_gsheet,
    preview_remove_all_products_by_filter_gsheet,
    remove_all_products_by_filter_gsheet,
    update_base_product_gsheet,
)
from core.gsheets_client import GSheetsClient
from routes._state import APP_ROOT, DATA_XLSX_PATH, ScriptRequest, _require_active_sheet

router = APIRouter()


@router.post("/api/addNewProduct")
def api_add_new_product(req: ScriptRequest) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha ALVO primeiro."})
    product = req.args[0] if req.args else {}
    return JSONResponse(add_new_product_gsheet(active["sheet_id"], product))


@router.post("/api/updateBaseProduct")
def api_update_base_product(req: ScriptRequest) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Conecte a planilha ALVO primeiro."})
    original_code = req.args[0] if len(req.args) > 0 else ""
    product = req.args[1] if len(req.args) > 1 else {}
    return JSONResponse(update_base_product_gsheet(active["sheet_id"], original_code, product))


@router.post("/api/getProductByBarcode")
def api_get_product_by_barcode(req: ScriptRequest) -> JSONResponse:
    barcode = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    return JSONResponse(get_product_by_barcode_gsheet(active["sheet_id"], barcode))


@router.post("/api/removeAllProductsByFilter")
def api_remove_all_products_by_filter(req: ScriptRequest) -> JSONResponse:
    filter_key = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if active:
        return JSONResponse(remove_all_products_by_filter_gsheet(active["sheet_id"], filter_key))
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        return JSONResponse(remove_all_products_by_filter_xlsx(DATA_XLSX_PATH, filter_key))
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@router.post("/api/previewRemoveAllProductsByFilter")
def api_preview_remove_all_products_by_filter(req: ScriptRequest) -> JSONResponse:
    filter_key = req.args[0] if req.args else ""
    active = _require_active_sheet()
    if active:
        return JSONResponse(preview_remove_all_products_by_filter_gsheet(active["sheet_id"], filter_key))
    if DATA_XLSX_PATH and DATA_XLSX_PATH.exists():
        return JSONResponse(preview_remove_all_products_by_filter_xlsx(DATA_XLSX_PATH, filter_key))
    return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})


@router.post("/api/generateSkuReportCustom")
def api_generate_sku_report_custom(req: ScriptRequest) -> JSONResponse:
    destination = req.args[0] if len(req.args) > 0 else "same"
    abas = req.args[1] if len(req.args) > 1 else []
    colunas = req.args[2] if len(req.args) > 2 else []
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    return JSONResponse(generate_sku_report_custom_gsheet(active["sheet_id"], destination, abas, colunas))


@router.post("/api/generateKdabraSheet")
def api_generate_kdabra_sheet(_: ScriptRequest | None = None) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    return JSONResponse(generate_kdabra_sheet_gsheet(active["sheet_id"]))


@router.post("/api/generateKdabraEnderecarSheet")
def api_generate_kdabra_enderecar_sheet(_: ScriptRequest | None = None) -> JSONResponse:
    active = _require_active_sheet()
    if not active:
        return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
    return JSONResponse(generate_kdabra_enderecar_sheet_gsheet(active["sheet_id"]))


@router.post("/api/exportFilteredUnallocatedXlsx")
def api_export_filtered_unallocated_xlsx(req: ScriptRequest) -> JSONResponse:
    destination = str(req.args[0]).strip().lower() if len(req.args) > 0 else "new"
    rows = req.args[1] if len(req.args) > 1 else []
    requested_name = str(req.args[2]).strip() if len(req.args) > 2 else "Relatório Não Endereçados"
    if not isinstance(rows, list):
        rows = []

    default_headers = [
        "codigo_sku", "descricao", "categoria_armazenagem", "tipo_filtro",
        "grupo", "subcategoria", "quantidade", "curva", "vendas",
    ]
    headers = default_headers
    if rows and isinstance(rows[0], dict):
        first_keys = list(rows[0].keys())
        if first_keys:
            headers = first_keys

    normalized_rows: list[list[Any]] = []
    for row in rows:
        if isinstance(row, dict):
            normalized_rows.append([row.get(h, "") for h in headers])
        elif isinstance(row, list):
            normalized_rows.append(row)

    if destination == "same":
        active = _require_active_sheet()
        if not active:
            return JSONResponse({"success": False, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro."})
        sheet_name = (requested_name or "Relatório Não Endereçados").strip()[:90]
        client = GSheetsClient(active["sheet_id"])
        client.ensure_sheet(sheet_name)
        client.clear_sheet(sheet_name)
        client.append_rows(sheet_name, [headers] + normalized_rows)
        return JSONResponse(
            {
                "success": True,
                "mode": "same",
                "sheetName": sheet_name,
                "sheetUrl": client.get_sheet_url(sheet_name),
                "rowsWritten": len(normalized_rows),
            }
        )

    wb = Workbook()
    ws = wb.active
    ws.title = "Nao_Enderecados"
    ws.append(headers)
    for row in normalized_rows:
        ws.append(row)

    buffer = io.BytesIO()
    wb.save(buffer)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    filename = f"Relatorio_Nao_Enderecados_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return JSONResponse(
        {
            "success": True,
            "mode": "new",
            "filename": filename,
            "xlsxBase64": encoded,
            "rowsWritten": len(normalized_rows),
        }
    )
