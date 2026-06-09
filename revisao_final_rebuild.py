from copy import copy
from math import floor
from pathlib import Path

import openpyxl


CURRENT_PATH = Path("/Users/andrelobo/Downloads/RevisaoFinal.xlsx")
PREV_REVISED_PATH = Path("/Users/andrelobo/Downloads/enderecamentoFinal_revisado.xlsx")
JOIN_UPDATED_PATH = Path("/Users/andrelobo/Downloads/Plano_Enderecamento_Final_JOIN_ATUALIZADO.xlsx")
OUTPUT_PATH = Path("/Users/andrelobo/Downloads/RevisaoFinal_corrigida.xlsx")

SLOT_COLUMNS = [
    "escaninhos_necessarios",
    "tipo_equipamento_base",
    "escaninhos_necessarios_freezer",
    "escaninhos_necessarios_geladeira",
    "escaninhos_necessarios_geladeira_alta",
    "escaninhos_necessarios_prateleira",
    "escaninhos_necessarios_prateleira_lateral",
]

GARBAGE_MIX_CODES = {
    "KDB10848",
    "KDB10849",
    "KDB10850",
    "KDB11759",
    "KDB11787",
}


def normalize_code(value):
    if value is None:
        return None
    return str(value).strip().upper()


def clone_cell(source_cell, target_cell):
    target_cell.value = source_cell.value
    if source_cell.has_style:
        target_cell._style = copy(source_cell._style)
    target_cell.number_format = source_cell.number_format
    target_cell.font = copy(source_cell.font)
    target_cell.fill = copy(source_cell.fill)
    target_cell.border = copy(source_cell.border)
    target_cell.alignment = copy(source_cell.alignment)
    target_cell.protection = copy(source_cell.protection)


def copy_sheet_defaults(source_ws, target_ws):
    target_ws.sheet_format.defaultColWidth = source_ws.sheet_format.defaultColWidth
    target_ws.sheet_format.defaultRowHeight = source_ws.sheet_format.defaultRowHeight
    target_ws.freeze_panes = source_ws.freeze_panes
    target_ws.sheet_view.showGridLines = source_ws.sheet_view.showGridLines
    target_ws.page_margins = copy(source_ws.page_margins)
    target_ws.page_setup = copy(source_ws.page_setup)
    target_ws.print_options = copy(source_ws.print_options)
    target_ws.sheet_state = source_ws.sheet_state
    for key, dim in source_ws.column_dimensions.items():
        target_dim = target_ws.column_dimensions[key]
        target_dim.width = dim.width
        target_dim.hidden = dim.hidden
        target_dim.bestFit = dim.bestFit
        target_dim.outlineLevel = dim.outlineLevel
        target_dim.collapsed = dim.collapsed


def worksheet_index(ws):
    return {ws.cell(1, c).value: c for c in range(1, ws.max_column + 1)}


def numeric(value):
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if "," in text and ("." not in text or text.rfind(",") > text.rfind(".")):
        text = text.replace(".", "").replace(",", ".")
    else:
        text = text.replace(",", "")
    return float(text)


def main():
    wb_current = openpyxl.load_workbook(CURRENT_PATH)
    wb_prev = openpyxl.load_workbook(PREV_REVISED_PATH, data_only=False)
    wb_join = openpyxl.load_workbook(JOIN_UPDATED_PATH, data_only=False)

    ws_mix = wb_current["Mix"]
    ws_base = wb_current["Base"]
    ws_plan = wb_current["Plano_Enderecamento_Final"]

    ws_prev_base = wb_prev["Base"]
    ws_join = wb_join["Plano_Enderecamento_Final_JOIN"]

    mix_idx = worksheet_index(ws_mix)
    base_idx = worksheet_index(ws_base)
    prev_base_idx = worksheet_index(ws_prev_base)
    join_idx = worksheet_index(ws_join)

    current_mix_rows = {}
    for r in range(2, ws_mix.max_row + 1):
        code = normalize_code(ws_mix.cell(r, mix_idx["Código"]).value)
        if code:
            current_mix_rows[code] = r

    current_base_rows = {}
    for r in range(2, ws_base.max_row + 1):
        code = normalize_code(ws_base.cell(r, base_idx["product_code"]).value)
        if code:
            current_base_rows[code] = r

    prev_base_rows = {}
    for r in range(2, ws_prev_base.max_row + 1):
        code = normalize_code(ws_prev_base.cell(r, prev_base_idx["product_code"]).value)
        if code:
            prev_base_rows[code] = r

    # 1) Clean obvious garbage from Mix.
    rows_to_delete = [
        current_mix_rows[code]
        for code in GARBAGE_MIX_CODES
        if code in current_mix_rows and code not in current_base_rows
    ]
    for row_number in sorted(rows_to_delete, reverse=True):
        ws_mix.delete_rows(row_number, 1)

    # Rebuild mix row index after deletions.
    mix_idx = worksheet_index(ws_mix)
    current_mix_rows = {}
    for r in range(2, ws_mix.max_row + 1):
        code = normalize_code(ws_mix.cell(r, mix_idx["Código"]).value)
        if code:
            current_mix_rows[code] = r

    # 2) Restore slot fields that ETL overwrote versus the prior reviewed base.
    slot_diffs = []
    for code, current_row in current_base_rows.items():
        prev_row = prev_base_rows.get(code)
        if not prev_row:
            continue
        different = False
        for column_name in SLOT_COLUMNS:
            if ws_base.cell(current_row, base_idx[column_name]).value != ws_prev_base.cell(prev_row, prev_base_idx[column_name]).value:
                different = True
                break
        if different:
            slot_diffs.append((code, current_row, prev_row))
            for column_name in SLOT_COLUMNS:
                ws_base.cell(current_row, base_idx[column_name]).value = ws_prev_base.cell(prev_row, prev_base_idx[column_name]).value

    # 3) Lower Mix quantities for the restored manual-slot products so ETL doesn't reopen extra slots.
    for code, current_row, prev_row in slot_diffs:
        if code not in current_mix_rows:
            continue
        mix_row = current_mix_rows[code]
        current_qty = numeric(ws_base.cell(current_row, base_idx["quantidade"]).value)
        current_slots = numeric(ws_prev_base.cell(prev_row, prev_base_idx["escaninhos_necessarios"]).value)
        etl_slots = numeric(wb_current["Base"].cell(current_row, base_idx["escaninhos_necessarios"]).value)
        # etl_slots above already got overwritten in-memory by restored value; use prior current workbook snapshot via prev read is impossible here.
        # Recover the ETL-written slot count from the original current file on disk by reading the cell again.

    # Reload original current workbook read-only for the ETL slot counts before restoration.
    wb_current_original = openpyxl.load_workbook(CURRENT_PATH, data_only=False)
    ws_base_original = wb_current_original["Base"]
    base_original_idx = worksheet_index(ws_base_original)
    current_mix_rows = {}
    for r in range(2, ws_mix.max_row + 1):
        code = normalize_code(ws_mix.cell(r, mix_idx["Código"]).value)
        if code:
            current_mix_rows[code] = r

    for code, current_row, prev_row in slot_diffs:
        if code not in current_mix_rows:
            continue
        mix_row = current_mix_rows[code]
        current_qty = numeric(ws_base_original.cell(current_row, base_original_idx["quantidade"]).value)
        etl_slots = numeric(ws_base_original.cell(current_row, base_original_idx["escaninhos_necessarios"]).value)
        target_slots = numeric(ws_prev_base.cell(prev_row, prev_base_idx["escaninhos_necessarios"]).value)
        if current_qty is None or etl_slots in (None, 0) or target_slots is None:
            continue
        if target_slots <= 0:
            new_qty = 0
        elif etl_slots <= target_slots:
            new_qty = current_qty
        else:
            new_qty = max(1, floor(current_qty * target_slots / etl_slots))
        ws_mix.cell(mix_row, mix_idx["Quantidade"]).value = new_qty

    # 4) Fix the only remaining real Mix/Base quantity mismatch.
    if "KDB12581" in current_mix_rows and "KDB12581" in current_base_rows:
        base_qty = ws_base.cell(current_base_rows["KDB12581"], base_idx["quantidade"]).value
        ws_mix.cell(current_mix_rows["KDB12581"], mix_idx["Quantidade"]).value = numeric(base_qty) if base_qty is not None else base_qty

    # 5) Rebuild Plano_Enderecamento_Final from the reviewed join, filtering out products not present in both Mix and Base.
    valid_codes = set()
    for r in range(2, ws_mix.max_row + 1):
        code = normalize_code(ws_mix.cell(r, mix_idx["Código"]).value)
        if code:
            valid_codes.add(code)
    valid_codes &= set(current_base_rows)

    ws_plan.delete_rows(1, ws_plan.max_row)
    copy_sheet_defaults(ws_join, ws_plan)
    ws_plan.title = "Plano_Enderecamento_Final"

    for col in range(1, ws_join.max_column + 1):
        clone_cell(ws_join.cell(1, col), ws_plan.cell(1, col))
    ws_plan.auto_filter.ref = f"A1:{openpyxl.utils.get_column_letter(ws_join.max_column)}1"

    out_row = 2
    for source_row in range(2, ws_join.max_row + 1):
        code = normalize_code(ws_join.cell(source_row, join_idx["product_code"]).value)
        if code not in valid_codes:
            continue
        src_dim = ws_join.row_dimensions[source_row]
        if src_dim.height is not None:
            ws_plan.row_dimensions[out_row].height = src_dim.height
        for col in range(1, ws_join.max_column + 1):
            clone_cell(ws_join.cell(source_row, col), ws_plan.cell(out_row, col))
        out_row += 1

    wb_current.save(OUTPUT_PATH)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    main()
