from __future__ import annotations

import argparse
import re
from pathlib import Path
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from core.gsheets_backend import (
    SHEET_BASE_PRODUTOS,
    SHEET_PLANO_FINAL,
    _build_location_map,
    _build_new_row_value,
    _find_header_index,
)
from core.gsheets_client import GSheetsClient, extract_sheet_id
from core.utils import normalize_string

TARGET_SHEET_ID = "1W998QOxwvUyxFzLDjiyNhAjaEye5TSHVQ0ecPBMR5X0"
N2_SHEET_NAME = "addressing_template - 2026-04-18T113752.984"
N3_SHEET_NAME = "Planilha de controle de reenderecamento Pamplona"
LOCATION_RE = re.compile(r"^(?P<galpao>[^-]+)-R(?P<rua>\d+)-(?P<equip>\d+)-(?P<nivel>\d+)(?P<pos>[A-Z]+)$", re.I)


def _timestamp() -> str:
    return datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y%m%d_%H%M%S")


def _sheet_title(base: str, suffix: str) -> str:
    return f"{base}_{suffix}"[:99]


def norm_code(value: Any) -> str:
    return normalize_string(value).upper()


def norm_text(value: Any) -> str:
    return normalize_string(value)


def norm_loc(value: Any) -> str:
    return normalize_string(value).upper()


def pos_to_index(pos: str) -> int:
    total = 0
    for ch in str(pos or "").upper():
        if "A" <= ch <= "Z":
            total = total * 26 + (ord(ch) - 64)
    return total


def normalize_equipment_type(value: Any) -> str:
    text = norm_text(value).lower()
    if text == "prateleira_pamplona":
        return "prateleira"
    return text


def parse_number(value: Any) -> float:
    text = str(value or "").strip()
    if not text:
        return 0.0
    if text.count(",") == 1 and text.count(".") > 1:
        text = text.replace(".", "").replace(",", ".")
    else:
        text = text.replace(",", ".")
    try:
        return float(text)
    except Exception:
        return 0.0


def equipment_type_family(value: Any) -> str:
    equipment_type = normalize_equipment_type(value)
    if equipment_type in {"geladeira", "geladeira_alta"}:
        return "cold"
    return equipment_type


def equipment_types_compatible(anchor_type: Any, candidate_type: Any) -> bool:
    anchor_family = equipment_type_family(anchor_type)
    candidate_family = equipment_type_family(candidate_type)
    if not anchor_family or not candidate_family:
        return True
    return anchor_family == candidate_family


@dataclass(frozen=True)
class LocationInfo:
    location_id: str
    galpao: str
    rua: int
    equipamento: int
    nivel: int
    pos: str
    pos_index: int


@dataclass
class DesiredProduct:
    code: str
    source: str
    anchor: str
    required_bins: int
    assigned_locations: list[str]
    authoritative_locations: list[str] = field(default_factory=list)


def parse_location(location_id: str) -> LocationInfo | None:
    text = norm_loc(location_id)
    match = LOCATION_RE.match(text)
    if not match:
        return None
    return LocationInfo(
        location_id=text,
        galpao=match.group("galpao").upper(),
        rua=int(match.group("rua")),
        equipamento=int(match.group("equip")),
        nivel=int(match.group("nivel")),
        pos=match.group("pos").upper(),
        pos_index=pos_to_index(match.group("pos")),
    )


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


def _unique_locations_in_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        norm = norm_loc(value)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        result.append(norm)
    return result


def _build_location_from_parts(galpao: Any, rua: Any, estante: Any, escaninho: Any) -> str:
    galpao_text = norm_text(galpao).upper()
    rua_text = norm_text(rua).upper()
    estante_text = norm_text(estante)
    escaninho_text = norm_text(escaninho).upper()
    if rua_text == "A" and estante_text.upper() == "A" and escaninho_text.upper() == "A":
        return "AAA"
    return f"{galpao_text}-{rua_text}-{estante_text}-{escaninho_text}"


def load_target_state(client: GSheetsClient) -> dict[str, Any]:
    base_rows = client.read_sheet(SHEET_BASE_PRODUTOS)
    base_by_code: dict[str, dict[str, Any]] = {}
    for row in base_rows:
        code = norm_code(row.get("product_code"))
        if not code:
            continue
        quantity = parse_number(row.get("quantidade"))
        if quantity is not None and quantity <= 0:
            continue
        try:
            required_bins = int(float(str(row.get("escaninhos_necessarios") or "1").replace(",", ".")))
        except Exception:
            required_bins = 1
        enriched = dict(row)
        enriched["escaninhos_necessarios"] = max(1, required_bins)
        base_by_code[code] = enriched

    values = client.read_values(SHEET_PLANO_FINAL)
    if not values:
        raise RuntimeError("Plano_Enderecamento_Final vazio ou inexistente.")
    headers = [str(h).strip() if h is not None else "" for h in values[0]]
    rows = [row + [None] * (len(headers) - len(row)) for row in values[1:]]
    location_map = _build_location_map(headers, rows)

    location_infos: dict[str, LocationInfo] = {}
    location_types: dict[str, str] = {}
    location_capacity: dict[str, int] = {}
    location_capacity_l: dict[str, float] = {}
    location_rows: dict[str, list[int]] = defaultdict(list)
    supplement_by_code: dict[str, dict[str, Any]] = {}
    code_idx = _find_header_index(headers, "product_code", "produto_alocado_code")
    loc_idx = _find_header_index(headers, "location_id")
    type_idx = _find_header_index(headers, "tipo_equipamento")
    cap_l_idx = _find_header_index(headers, "capacidade_l", "capacidade_L")
    if code_idx == -1 or loc_idx == -1:
        raise RuntimeError("Plano_Enderecamento_Final sem colunas obrigatórias.")

    for row_num, row in enumerate(rows, start=2):
        location_id = norm_loc(row[loc_idx] if loc_idx < len(row) else None)
        if not location_id:
            continue
        info = parse_location(location_id)
        if info:
            location_infos[location_id] = info
        if type_idx != -1 and type_idx < len(row):
            location_types[location_id] = normalize_equipment_type(row[type_idx])
        if cap_l_idx != -1 and cap_l_idx < len(row) and location_id not in location_capacity_l:
            location_capacity_l[location_id] = parse_number(row[cap_l_idx])
        location_capacity[location_id] = location_capacity.get(location_id, 0) + 1
        location_rows[location_id].append(row_num)

        code = norm_code(row[code_idx] if code_idx < len(row) else None)
        if code and code != "VAZIO" and code not in supplement_by_code:
            supplement_by_code[code] = {
                "product_code": code,
                "product_name": row[_find_header_index(headers, "product_name")] if _find_header_index(headers, "product_name") != -1 else None,
                "quantidade": row[_find_header_index(headers, "quantidade")] if _find_header_index(headers, "quantidade") != -1 else None,
                "curva": row[_find_header_index(headers, "curva")] if _find_header_index(headers, "curva") != -1 else None,
                "grupo": row[_find_header_index(headers, "grupo")] if _find_header_index(headers, "grupo") != -1 else None,
                "categoria_armazenagem": row[_find_header_index(headers, "categoria_armazenagem")] if _find_header_index(headers, "categoria_armazenagem") != -1 else None,
                "vol_l_unitario": row[_find_header_index(headers, "vol_l_unitario")] if _find_header_index(headers, "vol_l_unitario") != -1 else row[_find_header_index(headers, "vol_L_unitario")] if _find_header_index(headers, "vol_L_unitario") != -1 else None,
                "vol_L_unitario": row[_find_header_index(headers, "vol_L_unitario")] if _find_header_index(headers, "vol_L_unitario") != -1 else None,
                "venda_total": row[_find_header_index(headers, "venda_total")] if _find_header_index(headers, "venda_total") != -1 else None,
                "nm_fabricante": row[_find_header_index(headers, "nm_fabricante")] if _find_header_index(headers, "nm_fabricante") != -1 else None,
                "altura_cm": row[_find_header_index(headers, "altura_cm")] if _find_header_index(headers, "altura_cm") != -1 else None,
                "peso_kg_unitario": row[_find_header_index(headers, "peso_kg_unitario")] if _find_header_index(headers, "peso_kg_unitario") != -1 else None,
                "subcategoria": row[_find_header_index(headers, "subcategoria")] if _find_header_index(headers, "subcategoria") != -1 else None,
                "is_pesado": row[_find_header_index(headers, "is_pesado")] if _find_header_index(headers, "is_pesado") != -1 else None,
                "is_alto": row[_find_header_index(headers, "is_alto")] if _find_header_index(headers, "is_alto") != -1 else None,
            }

    by_equip_level: dict[tuple[str, int, int, int], list[str]] = defaultdict(list)
    by_equip: dict[tuple[str, int, int], list[str]] = defaultdict(list)
    for loc, info in location_infos.items():
        by_equip_level[(info.galpao, info.rua, info.equipamento, info.nivel)].append(loc)
        by_equip[(info.galpao, info.rua, info.equipamento)].append(loc)

    for key in by_equip_level:
        by_equip_level[key].sort(key=lambda loc: location_infos[loc].pos_index)
    for key in by_equip:
        by_equip[key].sort(key=lambda loc: (location_infos[loc].nivel, location_infos[loc].pos_index))

    return {
        "headers": headers,
        "rows": rows,
        "location_map": location_map,
        "location_rows": location_rows,
        "location_capacity": location_capacity,
        "location_capacity_l": location_capacity_l,
        "location_infos": location_infos,
        "location_types": location_types,
        "by_equip_level": by_equip_level,
        "by_equip": by_equip,
        "base_by_code": base_by_code,
        "supplement_by_code": supplement_by_code,
    }


def load_n2_data(client: GSheetsClient) -> dict[str, Any]:
    rows = client.read_sheet(N2_SHEET_NAME)
    by_code: dict[str, list[str]] = defaultdict(list)
    by_location: dict[str, list[str]] = defaultdict(list)
    aaa_count = 0
    for record in rows:
        code = norm_code(record.get("cod_produto"))
        if not code:
            continue
        location = _build_location_from_parts(
            record.get("galpao"),
            record.get("rua"),
            record.get("estante"),
            record.get("escaninho"),
        )
        if not location:
            continue
        if location == "AAA":
            aaa_count += 1
        by_code[code].append(location)
        by_location[location].append(code)
    return {
        "by_code": {code: _unique_locations_in_order(locations) for code, locations in by_code.items()},
        "by_location": {location: list(codes) for location, codes in by_location.items()},
        "aaa_count": aaa_count,
    }


def load_n3_data(client: GSheetsClient) -> dict[str, Any]:
    rows = client.read_sheet(N3_SHEET_NAME)
    by_code: dict[str, list[str]] = defaultdict(list)
    by_location: dict[str, list[str]] = defaultdict(list)
    invalid: list[tuple[str, str]] = []
    for record in rows:
        code = norm_code(record.get("Codigo produto"))
        position = norm_loc(record.get("Posição"))
        if not code or not position or position == "NAN":
            continue
        if not LOCATION_RE.match(position):
            invalid.append((code, position))
            continue
        by_code[code].append(position)
        by_location[position].append(code)
    return {
        "by_code": {code: _unique_locations_in_order(locations) for code, locations in by_code.items()},
        "by_location": {location: list(codes) for location, codes in by_location.items()},
        "invalid": invalid,
    }


def build_authoritative_products(state: dict[str, Any], n2_data: dict[str, Any], n3_data: dict[str, Any]) -> dict[str, DesiredProduct]:
    base_by_code = state["base_by_code"]
    desired: dict[str, DesiredProduct] = {}
    for code, base_row in base_by_code.items():
        n3_locations = [loc for loc in n3_data["by_code"].get(code, []) if loc and loc != "AAA"]
        n2_locations = [loc for loc in n2_data["by_code"].get(code, []) if loc and loc != "AAA"]
        if n3_locations:
            desired[code] = DesiredProduct(
                code=code,
                source="N3",
                anchor=n3_locations[0],
                required_bins=int(base_row["escaninhos_necessarios"]),
                assigned_locations=[],
                authoritative_locations=n3_locations,
            )
        elif n2_locations:
            desired[code] = DesiredProduct(
                code=code,
                source="N2",
                anchor=n2_locations[0],
                required_bins=int(base_row["escaninhos_necessarios"]),
                assigned_locations=[],
                authoritative_locations=n2_locations,
            )
    return desired


def count_n3_overrides(desired: dict[str, DesiredProduct], n2_data: dict[str, Any], n3_data: dict[str, Any]) -> tuple[int, int]:
    both = set(n2_data["by_code"]) & set(n3_data["by_code"]) & set(desired)
    overrides = 0
    same = 0
    for code in both:
        n2_anchor = (n2_data["by_code"].get(code) or [""])[0]
        n3_anchor = (n3_data["by_code"].get(code) or [""])[0]
        if norm_loc(n2_anchor) == norm_loc(n3_anchor):
            same += 1
        else:
            overrides += 1
    return overrides, same


def _anchor_order_key(product: DesiredProduct, state: dict[str, Any]) -> tuple[int, int, int, int, int, str]:
    info = state["location_infos"].get(product.anchor)
    if not info:
        return (9, 999, 999, 999, 999, product.code)
    return (0 if product.source == "N3" else 1, info.rua, info.equipamento, info.nivel, info.pos_index, product.code)


def _expansion_order_key(product: DesiredProduct, state: dict[str, Any]) -> tuple[int, int, int, int, int, str]:
    info = state["location_infos"].get(product.anchor)
    if not info:
        return (9, 999, 999, 999, 999, product.code)
    return (0 if product.source == "N3" else 1, -product.required_bins, info.rua, info.equipamento, info.nivel, product.code)


def candidate_locations_for_expansion(anchor: str, state: dict[str, Any], max_candidates: int | None = None) -> list[str]:
    info = state["location_infos"].get(anchor)
    if not info:
        return []
    anchor_type = state.get("location_types", {}).get(anchor, "")
    same_level = state.get("by_equip_level", {}).get((info.galpao, info.rua, info.equipamento, info.nivel), [])
    right = [loc for loc in same_level if state["location_infos"][loc].pos_index > info.pos_index]
    left = [loc for loc in reversed(same_level) if state["location_infos"][loc].pos_index < info.pos_index]
    ordered = [loc for loc in [*right, *left] if loc != anchor]
    seen: set[str] = set()
    result: list[str] = []
    for loc in ordered:
        if loc in seen:
            continue
        if anchor_type:
            candidate_type = state.get("location_types", {}).get(loc, "")
            if candidate_type and not equipment_types_compatible(anchor_type, candidate_type):
                continue
        seen.add(loc)
        result.append(loc)
        if max_candidates is not None and len(result) >= max_candidates:
            break
    return result


def product_volume_l(state: dict[str, Any], code: str) -> float:
    base_row = state.get("base_by_code", {}).get(code, {})
    supplement = state.get("supplement_by_code", {}).get(code, {})
    return (
        parse_number(base_row.get("vol_L_unitario"))
        or parse_number(base_row.get("vol_l_unitario"))
        or parse_number(supplement.get("vol_L_unitario"))
        or parse_number(supplement.get("vol_l_unitario"))
    )


def can_fit_location_volume(state: dict[str, Any], assignments_by_location: dict[str, list[str]], location_id: str, code: str) -> bool:
    capacity_l = float(state.get("location_capacity_l", {}).get(location_id, 0.0) or 0.0)
    if capacity_l <= 0:
        return True
    incoming = product_volume_l(state, code)
    if incoming <= 0:
        return True
    used = sum(product_volume_l(state, assigned_code) for assigned_code in assignments_by_location.get(location_id, []))
    return used + incoming <= capacity_l + 1e-9


def allocate_products(state: dict[str, Any], desired: dict[str, DesiredProduct]) -> dict[str, Any]:
    assignments_by_location: dict[str, list[str]] = defaultdict(list)
    anchor_over_capacity: list[tuple[str, str]] = []
    missing_anchor_locations: list[tuple[str, str, str]] = []

    for product in sorted(desired.values(), key=lambda item: _anchor_order_key(item, state)):
        authoritative_locations = product.authoritative_locations or [product.anchor]
        for authoritative_location in authoritative_locations:
            if authoritative_location == "AAA":
                continue
            if authoritative_location not in state["location_capacity"]:
                missing_anchor_locations.append((product.code, product.source, authoritative_location))
                continue
            capacity = state["location_capacity"][authoritative_location]
            if len(assignments_by_location[authoritative_location]) >= capacity:
                anchor_over_capacity.append((product.code, authoritative_location))
                continue
            assignments_by_location[authoritative_location].append(product.code)
            product.assigned_locations.append(authoritative_location)

    shortfalls: dict[str, int] = {}
    for product in sorted(desired.values(), key=lambda item: _expansion_order_key(item, state)):
        if product.anchor == "AAA" or product.anchor not in state["location_capacity"]:
            continue
        need = max(0, product.required_bins - len(product.assigned_locations))
        if need <= 0:
            continue
        candidate_pool: list[str] = []
        for authoritative_location in product.authoritative_locations or [product.anchor]:
            candidate_pool.extend(
                candidate_locations_for_expansion(
                    authoritative_location,
                    state,
                    max_candidates=max(0, product.required_bins - 1),
                )
            )
        candidates = _unique_locations_in_order(candidate_pool)
        if not candidates:
            shortfalls[product.code] = need
            continue

        for loc in candidates:
            if need <= 0:
                break
            if loc in product.assigned_locations:
                continue
            current = assignments_by_location[loc]
            capacity = state["location_capacity"][loc]
            if len(current) >= capacity:
                continue
            if not can_fit_location_volume(state, assignments_by_location, loc, product.code):
                continue
            current.append(product.code)
            product.assigned_locations.append(loc)
            need -= 1
        if need > 0:
            shortfalls[product.code] = need

    return {
        "assignments_by_location": assignments_by_location,
        "anchor_over_capacity": anchor_over_capacity,
        "missing_anchor_locations": missing_anchor_locations,
        "shortfalls": shortfalls,
    }


def build_row_updates(state: dict[str, Any], desired: dict[str, DesiredProduct], allocation: dict[str, Any]) -> dict[int, list[Any]]:
    headers = state["headers"]
    rows = state["rows"]
    location_rows = state["location_rows"]
    base_by_code = state["base_by_code"]
    supplement_by_code = state["supplement_by_code"]
    assignments = allocation["assignments_by_location"]
    slot_duplo_idx = _find_header_index(headers, "slot_duplo")

    updates: dict[int, list[Any]] = {}
    for location_id, row_numbers in location_rows.items():
        assigned_codes = assignments.get(location_id, [])
        slot_flag = "SIM" if len(assigned_codes) >= 2 else "NAO"
        for offset, row_num in enumerate(sorted(row_numbers)):
            original_row = rows[row_num - 2]
            code = assigned_codes[offset] if offset < len(assigned_codes) else None
            product_info = None
            if code:
                product_info = dict(supplement_by_code.get(code, {}))
                product_info.update(base_by_code.get(code, {}))
                product_info["product_code"] = code
            new_row = [
                _build_new_row_value(header, idx, product_info, original_row, headers)
                for idx, header in enumerate(headers)
            ]
            if slot_duplo_idx >= 0:
                if slot_duplo_idx >= len(new_row):
                    new_row.extend([None] * (slot_duplo_idx - len(new_row) + 1))
                new_row[slot_duplo_idx] = slot_flag
            updates[row_num] = new_row
    return updates


def build_assignments_from_state(state: dict[str, Any]) -> dict[str, list[str]]:
    headers = state["headers"]
    rows = state["rows"]
    code_idx = _find_header_index(headers, "product_code", "produto_alocado_code")
    loc_idx = _find_header_index(headers, "location_id")
    if code_idx == -1 or loc_idx == -1:
        raise RuntimeError("Plano_Enderecamento_Final sem colunas obrigatórias para leitura de alocação.")

    assignments: dict[str, list[str]] = defaultdict(list)
    for row in rows:
        location_id = norm_loc(row[loc_idx] if loc_idx < len(row) else None)
        if not location_id:
            continue
        code = norm_code(row[code_idx] if code_idx < len(row) else None)
        if not code or code == "VAZIO":
            continue
        assignments[location_id].append(code)
    return assignments


def verify_model(state: dict[str, Any], desired: dict[str, DesiredProduct], allocation: dict[str, Any], n2_data: dict[str, Any], n3_data: dict[str, Any]) -> dict[str, Any]:
    assignments = allocation["assignments_by_location"]
    location_capacity = state["location_capacity"]
    location_capacity_l = state.get("location_capacity_l", {})
    base_by_code = state["base_by_code"]
    location_types = state.get("location_types", {})
    location_infos = state["location_infos"]

    overfilled = {
        loc: (len(codes), location_capacity[loc])
        for loc, codes in assignments.items()
        if len(codes) > location_capacity.get(loc, 0)
    }
    inferred_volume_issues = []
    authoritative_volume_issues = []
    for loc, codes in assignments.items():
        cap_l = float(location_capacity_l.get(loc, 0.0) or 0.0)
        if cap_l <= 0 or not codes:
            continue
        used = sum(product_volume_l(state, code) for code in codes)
        if used <= cap_l + 1e-9:
            continue
        inferred_codes = [code for code in codes if norm_loc(desired.get(code, DesiredProduct(code, "", "", 0, [])).anchor) != norm_loc(loc)]
        issue = (loc, round(used, 4), round(cap_l, 4), list(codes))
        if inferred_codes:
            inferred_volume_issues.append(issue)
        else:
            authoritative_volume_issues.append(issue)

    assigned_counts = Counter()
    assigned_locations_by_code: dict[str, list[str]] = defaultdict(list)
    for loc, codes in assignments.items():
        for code in codes:
            assigned_counts[code] += 1
            assigned_locations_by_code[code].append(loc)

    neither_codes = []
    aaa_codes = []
    wrong_zero = []
    count_issues = []
    missing_anchor = []
    type_issues = []
    proximity_issues = []
    cross_rua_issues = []
    cross_scope_issues = []
    authoritative_location_issues = []
    assignment_mismatches = []
    for code, base_row in base_by_code.items():
        required = int(base_row["escaninhos_necessarios"])
        assigned = assigned_counts.get(code, 0)
        n3_locations = n3_data["by_code"].get(code, [])
        n2_locations = n2_data["by_code"].get(code, [])
        in_n3 = bool(n3_locations)
        in_n2 = bool(n2_locations)
        n2_is_aaa = bool(n2_locations) and all(norm_loc(loc) == "AAA" for loc in n2_locations)
        if not in_n3 and not in_n2:
            neither_codes.append(code)
            if assigned != 0:
                wrong_zero.append((code, assigned, "neither"))
        elif in_n3:
            if assigned == 0:
                wrong_zero.append((code, assigned, "n3"))
        elif n2_is_aaa:
            aaa_codes.append(code)
            if assigned != 0:
                wrong_zero.append((code, assigned, "aaa"))
        elif in_n2:
            if assigned == 0:
                wrong_zero.append((code, assigned, "n2"))

        if code in desired:
            product = desired[code]
            if product.anchor != "AAA" and product.anchor in state["location_capacity"]:
                if assigned > product.required_bins:
                    count_issues.append((code, product.required_bins, assigned, product.anchor))
                actual_locations = assigned_locations_by_code.get(code, [])
                if sorted(actual_locations) != sorted(product.assigned_locations):
                    assignment_mismatches.append((code, sorted(product.assigned_locations), sorted(actual_locations)))
                missing_authoritative_locations = [
                    location
                    for location in product.authoritative_locations or [product.anchor]
                    if location not in actual_locations
                ]
                if missing_authoritative_locations:
                    authoritative_location_issues.append((code, product.anchor, missing_authoritative_locations, actual_locations))
                if actual_locations and product.anchor not in actual_locations:
                    missing_anchor.append((code, product.anchor, actual_locations))
                anchor_type = location_types.get(product.anchor, "")
                if anchor_type:
                    actual_types = sorted({location_types.get(loc, "") for loc in actual_locations if location_types.get(loc, "")})
                    if any(not equipment_types_compatible(anchor_type, actual_type) for actual_type in actual_types):
                        type_issues.append((code, product.anchor, anchor_type, actual_types, actual_locations))
                anchor_info = location_infos.get(product.anchor)
                if anchor_info:
                    wrong_rua_locations = [
                        loc
                        for loc in actual_locations
                        if loc in location_infos and location_infos[loc].rua != anchor_info.rua
                    ]
                    if wrong_rua_locations:
                        cross_rua_issues.append((code, product.anchor, wrong_rua_locations))
                    wrong_scope_locations = [
                        loc
                        for loc in actual_locations
                        if loc in location_infos and (
                            location_infos[loc].galpao != anchor_info.galpao
                            or location_infos[loc].rua != anchor_info.rua
                            or location_infos[loc].equipamento != anchor_info.equipamento
                            or location_infos[loc].nivel != anchor_info.nivel
                        )
                    ]
                    if wrong_scope_locations:
                        cross_scope_issues.append((code, product.anchor, wrong_scope_locations))

    for code, product in desired.items():
        if product.anchor == "AAA" or product.required_bins <= 1:
            continue
        actual_locations = assigned_locations_by_code.get(code, [])
        if not actual_locations:
            continue
        anchor_info = location_infos.get(product.anchor)
        if not anchor_info:
            continue
        allowed_scope = {product.anchor, *candidate_locations_for_expansion(product.anchor, state, max_candidates=max(0, product.required_bins - 1))}
        outside_allowed_scope = [loc for loc in actual_locations if loc not in allowed_scope]
        if outside_allowed_scope:
            proximity_issues.append((code, product.anchor, list(actual_locations), sorted(allowed_scope)))

    return {
        "overfilled_locations": overfilled,
        "assigned_counts": assigned_counts,
        "wrong_zero": wrong_zero,
        "count_issues": count_issues,
        "assignment_mismatches": assignment_mismatches,
        "missing_anchor": missing_anchor,
        "type_issues": type_issues,
        "cross_rua_issues": cross_rua_issues,
        "cross_scope_issues": cross_scope_issues,
        "authoritative_location_issues": authoritative_location_issues,
        "neither_count": len(neither_codes),
        "aaa_count": len(aaa_codes),
        "proximity_issues": proximity_issues,
        "inferred_volume_issues": inferred_volume_issues,
        "authoritative_volume_issues": authoritative_volume_issues,
    }


def write_report_sheet(
    client: GSheetsClient,
    sheet_name: str,
    summary: dict[str, Any],
    desired: dict[str, DesiredProduct],
    allocation: dict[str, Any],
) -> str:
    client.ensure_sheet(sheet_name)
    client.clear_sheet(sheet_name)
    shortfalls = allocation["shortfalls"]
    rows: list[list[Any]] = [
        ["metric", "value"],
        ["produtos_base", summary["base_count"]],
        ["produtos_com_n3", summary["n3_count"]],
        ["produtos_com_n2", summary["n2_count"]],
        ["n3_sobre_n2_conflito", summary["n3_overrides"]],
        ["n3_igual_n2", summary["n3_same"]],
        ["produtos_n2_aaa", summary["n2_aaa"]],
        ["produtos_sem_n2_nem_n3", summary["neither_count"]],
        ["n3_invalidos_na_base", summary["n3_invalid_in_base"]],
        ["anchors_fora_capacidade", len(allocation["anchor_over_capacity"])],
        ["anchors_fora_do_layout", len(allocation["missing_anchor_locations"])],
        ["produtos_com_shortfall", len(shortfalls)],
        ["produtos_com_issue_autoritativo", summary["authoritative_location_issues"]],
        ["produtos_com_issue_escopo", summary["cross_scope_issues"]],
        ["produtos_com_issue_proximidade", summary["proximity_issues"]],
        [],
        ["product_code", "source", "anchor", "required_bins", "assigned_bins", "shortfall", "assigned_locations"],
    ]
    for product in sorted(desired.values(), key=lambda item: (item.source, item.anchor, item.code)):
        assigned = len(product.assigned_locations)
        shortfall = max(0, product.required_bins - assigned)
        rows.append(
            [
                product.code,
                product.source,
                product.anchor,
                product.required_bins,
                assigned,
                shortfall,
                " | ".join(product.assigned_locations),
            ]
        )
    client.append_rows(sheet_name, rows)
    return client.get_sheet_url(sheet_name)


def run(sheet_id: str, apply_changes: bool) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    timestamp = _timestamp()
    backup_dir = Path("outputs") / "reconcile_backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"backup_reconcile_{timestamp}.xlsx"
    backup_xlsx: str | None = None
    backup_xlsx_error: str | None = None
    try:
        client.export_xlsx(backup_path)
        backup_xlsx = str(backup_path.resolve())
    except Exception as exc:
        backup_xlsx_error = str(exc)

    backup_sheet_name = _sheet_title("Plano_Enderecamento_Final__backup_reconcile", timestamp)
    backup_sheet_url = _duplicate_sheet(client, SHEET_PLANO_FINAL, backup_sheet_name)

    state = load_target_state(client)
    n2_data_raw = load_n2_data(client)
    n3_data_raw = load_n3_data(client)

    base_codes = set(state["base_by_code"])
    n2_data = {
        "by_code": {code: locations for code, locations in n2_data_raw["by_code"].items() if code in base_codes},
        "by_location": {
            location: [code for code in codes if code in base_codes]
            for location, codes in n2_data_raw["by_location"].items()
        },
        "aaa_count": n2_data_raw["aaa_count"],
    }
    n3_data = {
        "by_code": {code: locations for code, locations in n3_data_raw["by_code"].items() if code in base_codes},
        "by_location": {
            location: [code for code in codes if code in base_codes]
            for location, codes in n3_data_raw["by_location"].items()
        },
        "invalid": n3_data_raw["invalid"],
    }
    n3_invalid_in_base = [(code, pos) for code, pos in n3_data["invalid"] if code in base_codes]

    desired = build_authoritative_products(state, n2_data, n3_data)
    allocation = allocate_products(state, desired)
    verification = verify_model(state, desired, allocation, n2_data, n3_data)
    n3_overrides, n3_same = count_n3_overrides(desired, n2_data, n3_data)

    summary = {
        "base_count": len(state["base_by_code"]),
        "n3_count": len(n3_data["by_code"]),
        "n2_count": len(n2_data["by_code"]),
        "n2_aaa": sum(1 for code, locations in n2_data["by_code"].items() if locations and all(norm_loc(loc) == "AAA" for loc in locations)),
        "n2_aaa_total_raw": n2_data["aaa_count"],
        "n3_invalid_in_base": len(n3_invalid_in_base),
        "n3_overrides": n3_overrides,
        "n3_same": n3_same,
        "neither_count": verification["neither_count"],
        "overfilled_locations": len(verification["overfilled_locations"]),
        "wrong_zero": len(verification["wrong_zero"]),
        "products_with_shortfall": len(allocation["shortfalls"]),
        "authoritative_location_issues": len(verification["authoritative_location_issues"]),
        "cross_scope_issues": len(verification["cross_scope_issues"]),
        "proximity_issues": len(verification["proximity_issues"]),
    }

    result = {
        "sheet_id": sheet_id,
        "backup_xlsx": backup_xlsx,
        "backup_xlsx_error": backup_xlsx_error,
        "backup_sheet_name": backup_sheet_name,
        "backup_sheet_url": backup_sheet_url,
        "summary": summary,
        "apply_changes": apply_changes,
        "shortfall_samples": sorted(allocation["shortfalls"].items())[:50],
        "anchor_capacity_issues": allocation["anchor_over_capacity"][:20],
        "missing_anchor_locations": allocation["missing_anchor_locations"][:20],
        "wrong_zero_samples": verification["wrong_zero"][:20],
        "count_issue_samples": verification["count_issues"][:20],
        "assignment_mismatch_samples": verification["assignment_mismatches"][:20],
        "authoritative_location_issue_samples": verification["authoritative_location_issues"][:20],
        "missing_anchor_samples": verification["missing_anchor"][:20],
        "type_issue_samples": verification["type_issues"][:20],
        "cross_rua_issue_samples": verification["cross_rua_issues"][:20],
        "cross_scope_issue_samples": verification["cross_scope_issues"][:20],
        "proximity_issue_samples": verification["proximity_issues"][:20],
        "inferred_volume_issue_samples": verification["inferred_volume_issues"][:20],
        "authoritative_volume_issue_samples": verification["authoritative_volume_issues"][:20],
    }

    if verification["overfilled_locations"]:
        raise RuntimeError(f"Modelo inválido: locations overfilled: {list(verification['overfilled_locations'].items())[:20]}")
    if verification["wrong_zero"]:
        raise RuntimeError(f"Modelo inválido: inconsistências de alocação: {verification['wrong_zero'][:20]}")
    if verification["count_issues"]:
        raise RuntimeError(f"Modelo inválido: contagem por SKU divergente: {verification['count_issues'][:20]}")
    if verification["assignment_mismatches"]:
        raise RuntimeError(f"Modelo inválido: alocação divergente do plano em memória: {verification['assignment_mismatches'][:20]}")
    if verification["authoritative_location_issues"]:
        raise RuntimeError(f"Modelo inválido: ocupação autoritativa perdida: {verification['authoritative_location_issues'][:20]}")
    if verification["missing_anchor"]:
        raise RuntimeError(f"Modelo inválido: anchor não preservado: {verification['missing_anchor'][:20]}")
    if verification["type_issues"]:
        raise RuntimeError(f"Modelo inválido: tipo de equipamento divergente: {verification['type_issues'][:20]}")
    if verification["cross_rua_issues"]:
        raise RuntimeError(f"Modelo inválido: produto espalhado em ruas diferentes: {verification['cross_rua_issues'][:20]}")
    if verification["cross_scope_issues"]:
        raise RuntimeError(f"Modelo inválido: produto fora do nível/equipamento âncora: {verification['cross_scope_issues'][:20]}")
    if verification["proximity_issues"]:
        raise RuntimeError(f"Modelo inválido: issues de proximidade: {verification['proximity_issues'][:20]}")
    if verification["inferred_volume_issues"]:
        raise RuntimeError(f"Modelo inválido: volume inferido acima da capacidade: {verification['inferred_volume_issues'][:20]}")

    if not apply_changes:
        return result

    updates = build_row_updates(state, desired, allocation)
    client.update_rows(SHEET_PLANO_FINAL, updates, len(state["headers"]))

    report_sheet_name = _sheet_title("Reconciliacao_N3_N2", timestamp)
    report_sheet_url = write_report_sheet(client, report_sheet_name, summary, desired, allocation)
    result["report_sheet_name"] = report_sheet_name
    result["report_sheet_url"] = report_sheet_url
    result["updated_rows"] = len(updates)

    state_after = load_target_state(client)
    allocation_after = {
        "assignments_by_location": build_assignments_from_state(state_after),
        "anchor_over_capacity": [],
        "missing_anchor_locations": [],
        "shortfalls": {},
    }
    verification_after = verify_model(state_after, desired, allocation_after, n2_data, n3_data)
    if (
        verification_after["overfilled_locations"]
        or verification_after["wrong_zero"]
        or verification_after["count_issues"]
        or verification_after["assignment_mismatches"]
        or verification_after["authoritative_location_issues"]
        or verification_after["missing_anchor"]
        or verification_after["type_issues"]
        or verification_after["cross_rua_issues"]
        or verification_after["cross_scope_issues"]
        or verification_after["proximity_issues"]
        or verification_after["inferred_volume_issues"]
    ):
        raise RuntimeError(
            "Verificação pós-gravação falhou: "
            f"overfilled={verification_after['overfilled_locations']} "
            f"wrong_zero={verification_after['wrong_zero'][:20]} "
            f"count_issues={verification_after['count_issues'][:20]} "
            f"assignment_mismatches={verification_after['assignment_mismatches'][:20]} "
            f"authoritative_location_issues={verification_after['authoritative_location_issues'][:20]} "
            f"missing_anchor={verification_after['missing_anchor'][:20]} "
            f"type_issues={verification_after['type_issues'][:20]} "
            f"cross_rua={verification_after['cross_rua_issues'][:20]} "
            f"cross_scope={verification_after['cross_scope_issues'][:20]} "
            f"proximity={verification_after['proximity_issues'][:20]} "
            f"inferred_volume_issues={verification_after['inferred_volume_issues'][:20]}"
        )

    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sheet", nargs="?", default=TARGET_SHEET_ID, help="Link ou ID da planilha alvo")
    parser.add_argument("--apply", action="store_true", help="Aplica a reconciliação na planilha")
    args = parser.parse_args()

    sheet_id = extract_sheet_id(args.sheet)
    if not sheet_id:
        raise SystemExit("Link/ID inválido")
    result = run(sheet_id, args.apply)
    print(result)


if __name__ == "__main__":
    main()
