from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from core.gsheets_backend import (
    DEFAULT_PLANO_HEADERS,
    SHEET_BASE_PRODUTOS,
    SHEET_PLANO_FINAL,
    _build_location_map,
    _build_new_row_value,
    _find_header_index,
)
from core.gsheets_client import GSheetsClient, extract_sheet_id
from core.utils import normalize_string


@dataclass
class DuplicateCase:
    product_code: str
    keep_row: int
    keep_location: str
    removed_rows: list[int]
    removed_locations: list[str]
    expected: int
    actual: int


def _timestamp() -> str:
    return datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y%m%d_%H%M%S")


def _sheet_title(base: str, suffix: str) -> str:
    raw = f"{base}_{suffix}"
    return raw[:99]


def _position_key(value: str) -> tuple[int, str]:
    text = str(value or "").strip().upper()
    if not text:
        return (999, "")
    total = 0
    for ch in text:
        if "A" <= ch <= "Z":
            total = total * 26 + (ord(ch) - 64)
    return (total if total else 999, text)


def _location_order_key(location_id: str) -> tuple[int, int, int, tuple[int, str], str]:
    text = str(location_id or "").strip()
    parts = text.split("-")
    rua = 999
    equip = 999
    nivel = -999
    pos = (999, "")
    try:
        if len(parts) >= 4:
            rua = int(parts[1].upper().replace("R", ""))
            equip = int(parts[2])
            esc = parts[3]
            digits = "".join(ch for ch in esc if ch.isdigit())
            letters = "".join(ch for ch in esc if ch.isalpha())
            nivel = -int(digits or "999")
            pos = _position_key(letters)
    except Exception:
        pass
    return (rua, equip, nivel, pos, text)


def _duplicate_sheet(client: GSheetsClient, source_name: str, new_name: str) -> str | None:
    client._load_metadata()
    source_id = client._sheet_map.get(source_name)
    if source_id is None:
        return None
    body = {
        "requests": [
            {
                "duplicateSheet": {
                    "sourceSheetId": source_id,
                    "newSheetName": new_name,
                }
            }
        ]
    }
    client._sheets.spreadsheets().batchUpdate(
        spreadsheetId=client.sheet_id,
        body=body,
    ).execute()
    client._metadata = None
    return client.get_sheet_url(new_name)


def _read_expected_bins(base_rows: list[dict[str, Any]]) -> dict[str, int]:
    expected = {}
    for row in base_rows:
        code = normalize_string(row.get("product_code"))
        if not code:
            continue
        try:
            esc = int(float(str(row.get("escaninhos_necessarios") or "1").replace(",", ".")))
        except Exception:
            esc = 1
        expected[code] = max(1, esc)
    return expected


def _load_plano_values(client: GSheetsClient) -> tuple[list[str], list[list[Any]], dict[str, list[int]], int]:
    values = client.read_values(SHEET_PLANO_FINAL)
    if not values:
        raise RuntimeError("Plano_Enderecamento_Final vazio ou não encontrado.")
    headers = [str(h).strip() if h is not None else "" for h in values[0]]
    header_changed = False
    if _find_header_index(headers, "slot_duplo") == -1:
        headers.append("slot_duplo")
        header_changed = True
    rows = [row + [None] * (len(headers) - len(row)) for row in values[1:]]
    location_map = _build_location_map(headers, rows)
    if header_changed:
        client.update_header(SHEET_PLANO_FINAL, headers)
    return headers, rows, location_map, len(values) - 1


def _find_cases(headers: list[str], rows: list[list[Any]], expected_bins: dict[str, int]) -> list[DuplicateCase]:
    code_idx = _find_header_index(headers, "product_code", "produto_alocado_code")
    loc_idx = _find_header_index(headers, "location_id")
    if code_idx == -1 or loc_idx == -1:
        raise RuntimeError("Colunas obrigatórias não encontradas em Plano_Enderecamento_Final.")

    by_code: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for row_num, row in enumerate(rows, start=2):
        code = normalize_string(row[code_idx] if code_idx < len(row) else None)
        location_id = normalize_string(row[loc_idx] if loc_idx < len(row) else None)
        if not code or code == "Vazio" or not location_id:
            continue
        by_code[code].append((row_num, location_id))

    cases: list[DuplicateCase] = []
    for code, placements in by_code.items():
        expected = expected_bins.get(code, 1)
        actual = len(placements)
        if expected != 1 or actual <= 1:
            continue
        ordered = sorted(placements, key=lambda item: _location_order_key(item[1]))
        keep_row, keep_location = ordered[-1]
        removed = ordered[:-1]
        cases.append(
            DuplicateCase(
                product_code=code,
                keep_row=keep_row,
                keep_location=keep_location,
                removed_rows=[row for row, _ in removed],
                removed_locations=[loc for _, loc in removed],
                expected=expected,
                actual=actual,
            )
        )
    cases.sort(key=lambda case: (-case.actual, case.product_code))
    return cases


def _summarize_cases(cases: list[DuplicateCase]) -> dict[str, Any]:
    return {
        "sku_count": len(cases),
        "excess_rows": sum(case.actual - case.expected for case in cases),
        "top_cases": [
            {
                "product_code": case.product_code,
                "actual": case.actual,
                "keep_location": case.keep_location,
                "removed_count": len(case.removed_rows),
            }
            for case in cases[:20]
        ],
    }


def _build_row_updates(
    headers: list[str],
    rows: list[list[Any]],
    location_map: dict[str, list[int]],
    cases: list[DuplicateCase],
) -> tuple[dict[int, list[Any]], set[str]]:
    row_states: dict[int, list[Any]] = {row_num: list(row) for row_num, row in enumerate(rows, start=2)}
    updates: dict[int, list[Any]] = {}
    affected_locations: set[str] = set()
    loc_idx = _find_header_index(headers, "location_id")
    slot_duplo_idx = _find_header_index(headers, "slot_duplo")

    for case in cases:
        for row_num in case.removed_rows:
            original_row = row_states[row_num]
            cleared = [
                _build_new_row_value(header, idx, None, original_row, headers)
                for idx, header in enumerate(headers)
            ]
            row_states[row_num] = cleared
            updates[row_num] = cleared[:]
            location_id = normalize_string(original_row[loc_idx] if loc_idx < len(original_row) else None)
            if location_id:
                affected_locations.add(location_id)
        affected_locations.add(case.keep_location)

    if slot_duplo_idx >= 0:
        for location_id in affected_locations:
            loc_rows = location_map.get(location_id) or []
            occupied = 0
            for row_num in loc_rows:
                row = row_states.get(row_num) or []
                code_idx = _find_header_index(headers, "product_code", "produto_alocado_code")
                code = normalize_string(row[code_idx] if code_idx < len(row) else None)
                if code and code != "Vazio":
                    occupied += 1
            flag = "SIM" if occupied >= 2 else "NAO"
            for row_num in loc_rows:
                row = row_states.get(row_num) or []
                if slot_duplo_idx >= len(row):
                    row.extend([None] * (slot_duplo_idx - len(row) + 1))
                row[slot_duplo_idx] = flag
                updates[row_num] = row[:]

    return updates, affected_locations


def _write_report_sheet(client: GSheetsClient, sheet_name: str, before: dict[str, Any], after: dict[str, Any], cases: list[DuplicateCase]) -> str:
    client.ensure_sheet(sheet_name)
    client.clear_sheet(sheet_name)
    rows: list[list[Any]] = [
        ["fase", "skus_duplicados_expected1", "excesso_total"],
        ["antes", before["sku_count"], before["excess_rows"]],
        ["depois", after["sku_count"], after["excess_rows"]],
        [],
        ["product_code", "actual_before", "keep_location", "removed_count", "removed_locations"],
    ]
    for case in cases:
        rows.append(
            [
                case.product_code,
                case.actual,
                case.keep_location,
                len(case.removed_rows),
                " | ".join(case.removed_locations),
            ]
        )
    client.append_rows(sheet_name, rows)
    return client.get_sheet_url(sheet_name)


def run(sheet_id: str, apply_changes: bool) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    timestamp = _timestamp()
    backup_dir = Path("outputs") / "sanitize_backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"backup_planilha_{timestamp}.xlsx"
    client.export_xlsx(backup_path)

    backup_sheet_name = _sheet_title("Plano_Enderecamento_Final__backup", timestamp)
    backup_sheet_url = _duplicate_sheet(client, SHEET_PLANO_FINAL, backup_sheet_name)

    base_rows = client.read_sheet(SHEET_BASE_PRODUTOS)
    expected_bins = _read_expected_bins(base_rows)
    headers, rows, location_map, _ = _load_plano_values(client)
    before_cases = _find_cases(headers, rows, expected_bins)
    before_summary = _summarize_cases(before_cases)

    result = {
        "sheet_id": sheet_id,
        "backup_xlsx": str(backup_path.resolve()),
        "backup_sheet_name": backup_sheet_name,
        "backup_sheet_url": backup_sheet_url,
        "before": before_summary,
        "applied": apply_changes,
    }
    if not apply_changes:
        return result

    updates, _ = _build_row_updates(headers, rows, location_map, before_cases)
    client.update_rows(SHEET_PLANO_FINAL, updates, len(headers))

    report_sheet_name = _sheet_title("Sanitizacao_Duplicados", timestamp)

    headers_after, rows_after, _, _ = _load_plano_values(client)
    after_cases = _find_cases(headers_after, rows_after, expected_bins)
    after_summary = _summarize_cases(after_cases)
    report_sheet_url = _write_report_sheet(client, report_sheet_name, before_summary, after_summary, before_cases)

    result["after"] = after_summary
    result["updated_rows"] = len(updates)
    result["report_sheet_name"] = report_sheet_name
    result["report_sheet_url"] = report_sheet_url
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sheet", help="Link ou ID da planilha Google Sheets")
    parser.add_argument("--apply", action="store_true", help="Aplica a limpeza")
    args = parser.parse_args()

    sheet_id = extract_sheet_id(args.sheet)
    if not sheet_id:
        raise SystemExit("Link/ID inválido")

    result = run(sheet_id, args.apply)
    print(result)


if __name__ == "__main__":
    main()
