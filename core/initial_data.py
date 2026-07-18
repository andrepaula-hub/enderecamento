from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

from .data_prep import (
    SHEET_BASE_PRODUTOS,
    SHEET_CONFIG_OPER,
    SHEET_DIC_CATEGORIAS,
    SHEET_VOLUMETRIA,
    build_base_produtos_map,
    build_dic_cat_map,
    load_limits,
    load_volumetria_map,
    load_sheet_safe,
)
from .excel_io import read_sheet
from .card175_snapshot import get_card175_context
from .utils import escape_html, normalize_string, parse_bool_flag, parse_number

SHEET_PLANO_FINAL = "Plano_Enderecamento_Final"
SHEET_LOG_FALHAS = "Log_Alocacao_Detalhado"
SHEET_REGRAS_RUAS = "Regras_Ruas"
SHEET_BARCODE = "Código de barras produtos"
SHEET_CADASTRO = "Cadastro_Equipamentos"

COR_MAP_GRUPO = {
    "alimento": "#1e8449",
    "flv": "#2ecc71",
    "flvs": "#2ecc71",
    "bebidas": "#1abc9c",
    "quimico": "#e74c3c",
    "perfumaria": "#85c1e9",
    "neutro": "#95a5a6",
    "vazio": "#ecf0f1",
    "default": "#bdc3c7",
}

COR_MAP_EQUIP = {
    "prateleira": "#95a5a6",
    "geladeira": "#5dade2",
    "geladeira_alta": "#85C1E9",
    "geladeira_americana": "#3498db",
    "freezer": "#1A5276",
    "prateleira lateral": "#34495e",
    "default": "#7f8c8d",
}

ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _position_label(position: Any) -> str:
    """Convert 1-based slot positions to spreadsheet-style letters: A..Z, AA.."""
    number = int(parse_number(position) or 0)
    if number <= 0:
        return ""

    label = ""
    while number:
        number, remainder = divmod(number - 1, 26)
        label = chr(65 + remainder) + label
    return label


def _json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


def _is_single_letter(value: Any) -> bool:
    text = normalize_string(value)
    return bool(text) and len(text) == 1 and not text.isnumeric()


def _curve_letter(curva_original: Any, marca_original: Any) -> str:
    curva_text = normalize_string(curva_original)
    marca_text = normalize_string(marca_original)

    if curva_text and _is_single_letter(curva_text):
        return curva_text[0].upper()
    if marca_text and _is_single_letter(marca_text) and curva_text and curva_text.isnumeric():
        return marca_text[0].upper()
    return ""


def _fmt_measure(value: Any, suffix: str = "", digits: int = 3) -> str:
    number = parse_number(value)
    if number is None:
        return "N/A"
    text = f"{number:.{digits}f}".rstrip("0").rstrip(".")
    if not text:
        text = "0"
    return f"{text}{suffix}"


def _resolve_slot_volume_model(row: dict[str, Any], product_data: dict[str, Any]) -> dict[str, Any]:
    metodo_raw = product_data.get("metodo") or row.get("metodo") or row.get("metodo_enderecamento") or ""
    metodo_norm = normalize_string(metodo_raw).lower()
    required_bins = max(1, _required_bins_from_row(product_data or row))
    quantidade_total = parse_number(product_data.get("quantidade") or row.get("quantidade") or 0) or 0.0
    caixas_necessarias = parse_number(product_data.get("caixas_necessarias") or row.get("caixas_necessarias") or 0) or 0.0
    caixa_volume_l = (
        (parse_number(product_data.get("caixa_volume_cm3_final") or row.get("caixa_volume_cm3_final")) or 0.0) / 1000.0
    )
    vol_unitario = (
        parse_number(product_data.get("vol_L_unitario") or product_data.get("vol_l_unitario"))
        or parse_number(row.get("vol_L_unitario") or row.get("vol_l_unitario"))
        or 0.0
    )

    if metodo_norm == "caixa" and caixas_necessarias > 0 and caixa_volume_l > 0:
        logical_count_total = caixas_necessarias
        logical_unit_volume_l = caixa_volume_l
        volume_total = logical_count_total * logical_unit_volume_l
    else:
        metodo_norm = "unitario"
        logical_count_total = quantidade_total
        logical_unit_volume_l = vol_unitario
        volume_total = logical_count_total * logical_unit_volume_l

    return {
        "metodo": metodo_norm,
        "required_bins": required_bins,
        "logical_count_total": logical_count_total,
        "logical_unit_volume_l": logical_unit_volume_l,
        "volume_total_l": volume_total,
        "quantidade_total": quantidade_total,
        "caixas_necessarias": caixas_necessarias,
    }


def _cascade_slot_distribution(
    total_count: float,
    unit_volume_l: float,
    capacities_l: list[float],
) -> list[float]:
    if total_count <= 0 or unit_volume_l <= 0 or not capacities_l:
        return [0.0 for _ in capacities_l]
    remaining = float(total_count)
    distribution: list[float] = []
    for capacity in capacities_l:
        if remaining <= 1e-9:
            distribution.append(0.0)
            continue
        if capacity <= 0:
            distribution.append(0.0)
            continue
        max_count_here = capacity / unit_volume_l
        assigned = min(remaining, max_count_here)
        distribution.append(assigned)
        remaining -= assigned
    return distribution


def _slot_quantity_and_volume(row: dict[str, Any], product_data: dict[str, Any]) -> tuple[float, int, float, float, float]:
    model = _resolve_slot_volume_model(row, product_data)
    quantity_in_bin = parse_number(row.get("quantidade_neste_escaninho"))
    volume_in_bin = parse_number(row.get("volume_neste_escaninho_l"))
    if quantity_in_bin is not None and volume_in_bin is not None:
        return (
            model["logical_count_total"],
            model["required_bins"],
            model["logical_unit_volume_l"],
            model["volume_total_l"],
            volume_in_bin,
        )
    quantidade_por_escaninho = (
        model["logical_count_total"] / model["required_bins"] if model["required_bins"] > 0 else model["logical_count_total"]
    )
    volume_no_escaninho = quantidade_por_escaninho * model["logical_unit_volume_l"]
    return (
        model["logical_count_total"],
        model["required_bins"],
        model["logical_unit_volume_l"],
        model["volume_total_l"],
        volume_no_escaninho,
    )


def _bin_volume_status(capacidade_l: Any, *used_volumes: Any) -> tuple[bool, float | None, float | None]:
    cap = parse_number(capacidade_l)
    total = 0.0
    seen = False
    for value in used_volumes:
        parsed = parse_number(value)
        if parsed is None:
            continue
        total += parsed
        seen = True
    if cap is None or not seen:
        return False, cap, total if seen else None
    return total > cap + 1e-9, cap, total


def _criar_info_hover(row: dict[str, Any], base_produtos_map: dict[str, dict[str, Any]]) -> str:
    if not row or row.get("product_code") in (None, "", "Vazio"):
        return "<b>Escaninho Vazio</b>"

    product_code = normalize_string(row.get("product_code"))
    product_data = base_produtos_map.get(product_code, {})
    card788_address = normalize_string(row.get("card788_address_original"))

    cat_armz = product_data.get("categoria_armazenagem") or row.get("categoria_armazenagem") or "N/A"
    grupo = (
        product_data.get("grupo")
        or row.get("grupo")
        or row.get("grupo_alocado")
        or "N/A"
    )
    nome = escape_html(product_data.get("product_name") or row.get("product_name") or "")
    fabricante = escape_html(product_data.get("nm_fabricante") or row.get("nm_fabricante") or "N/A")
    subcategoria = escape_html(product_data.get("subcategoria") or row.get("subcategoria") or "N/A")

    curva_original = product_data.get("curva") or row.get("curva") or ""
    marca_original = product_data.get("nm_fabricante") or row.get("nm_fabricante") or ""

    curva_final = "D"
    if _is_single_letter(curva_original):
        curva_final = normalize_string(curva_original).upper()
    elif _is_single_letter(marca_original) and normalize_string(curva_original).isnumeric():
        curva_final = normalize_string(marca_original).upper()
        fabricante = f"[{fabricante}]"
    elif curva_original:
        curva_final = normalize_string(curva_original)

    quantidade_total, escaninhos_necessarios, volume_unitario, volume_total, volume_no_escaninho = _slot_quantity_and_volume(row, product_data)
    quantidade_por_escaninho = parse_number(row.get("quantidade_neste_escaninho"))
    if quantidade_por_escaninho is None:
        if volume_unitario > 0 and volume_no_escaninho > 0:
            quantidade_por_escaninho = volume_no_escaninho / volume_unitario
        else:
            quantidade_por_escaninho = quantidade_total / escaninhos_necessarios if escaninhos_necessarios > 0 else quantidade_total

    altura_val = product_data.get("altura_cm") or row.get("altura_cm") or 0
    peso_val = product_data.get("peso_kg_unitario") or row.get("peso_kg_unitario") or 0

    altura = f"{parse_number(altura_val)} cm" if altura_val and altura_val != "Vazio" else "N/A"
    peso = f"{parse_number(peso_val)} kg" if peso_val and peso_val != "Vazio" else "N/A"

    degelo = normalize_string(product_data.get("degelo") or row.get("degelo")).upper()
    degelo_text = "N/A"
    if degelo == "NAO":
        degelo_text = "⚡ Degelo = NÃO"
    elif degelo == "PODE":
        degelo_text = "Degelo = PODE"

    metodo_raw = product_data.get("metodo") or row.get("metodo") or row.get("metodo_enderecamento")
    metodo_text = "N/A"
    if metodo_raw not in (None, ""):
        metodo_norm = normalize_string(metodo_raw)
        if metodo_norm == "caixa":
            metodo_text = "Caixa"
        elif metodo_norm in {"unitario", "unidade"}:
            metodo_text = "Unidade"
        else:
            metodo_text = escape_html(str(metodo_raw))

    return (
        f"<b>Produto:</b> {nome}<br>"
        f"<b>Armazenagem:</b> {cat_armz}<br>"
        f"<b>Grupo:</b> {escape_html(grupo)}<br>"
        f"<b>Subcategoria:</b> {subcategoria}<br>"
        f"<b>Código:</b> {escape_html(product_code)}<br>"
        f"<b>Endereço Card 788:</b> {escape_html(card788_address) if card788_address else 'N/A'}<br>"
        f"<b>Curva:</b> {curva_final}<br>"
        f"<b>Altura:</b> {altura}<br><b>Peso:</b> {peso}<br>"
        f"<b>Quantidade total:</b> {_fmt_measure(quantidade_total)}<br>"
        f"<b>Qtd neste escaninho:</b> {_fmt_measure(quantidade_por_escaninho)}<br>"
        f"<b>Volume unitário:</b> {_fmt_measure(volume_unitario, ' L', 3)}<br>"
        f"<b>Volume total do produto:</b> {_fmt_measure(volume_total, ' L', 3)}<br>"
        f"<b>Volume neste escaninho:</b> {_fmt_measure(volume_no_escaninho, ' L', 3)}<br>"
        f"<b>Degelo:</b> {degelo_text}<br>"
        f"<b>Método:</b> {metodo_text}<br>"
        f"<b>Escaninhos Necessários:</b> {escaninhos_necessarios}<br>"
        f"<span style='display:none' data-cat-armz='{escape_html(cat_armz)}'></span>"
    )


def _build_dashboard_data(
    plano_data: list[dict[str, Any]],
    base_produtos_map: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    def _merge_product_row(row: dict[str, Any]) -> dict[str, Any]:
        product_code = normalize_string(row.get("product_code"))
        product_info = (
            base_produtos_map.get(product_code, {})
            if product_code and product_code != "Vazio"
            else {}
        )
        merged = {**row, **product_info}
        if product_info.get("curva"):
            merged["curva"] = product_info.get("curva")
        if product_info.get("nm_fabricante"):
            merged["nm_fabricante"] = product_info.get("nm_fabricante")

        info_hover = _criar_info_hover(merged, base_produtos_map)
        grupo_final = (
            product_info.get("grupo")
            or row.get("grupo_alocado")
            or row.get("grupo")
            or ("neutro" if product_code and product_code != "Vazio" else "Vazio")
        )
        grupo_final_norm = normalize_string(grupo_final).lower()
        if product_code and product_code != "Vazio":
            cor_grupo = COR_MAP_GRUPO.get(grupo_final_norm, COR_MAP_GRUPO["default"])
        else:
            cor_grupo = COR_MAP_GRUPO["vazio"]

        merged["is_pesado"] = parse_bool_flag(product_info.get("is_pesado"))
        merged["is_alto"] = parse_bool_flag(product_info.get("is_alto"))
        merged["is_pequeno"] = parse_bool_flag(product_info.get("is_pequeno"))
        merged["is_fragil"] = product_info.get("is_fragil") or ""
        merged["degelo"] = product_info.get("degelo") or ""
        merged["info_hover"] = info_hover
        merged["cor_grupo"] = cor_grupo
        merged["_product_code_norm"] = product_code
        return merged

    rows_by_location: dict[str, list[dict[str, Any]]] = {}
    ordered_locations: list[str] = []
    for row in plano_data:
        location_id = normalize_string(row.get("location_id"))
        if not location_id:
            continue
        if location_id not in rows_by_location:
            rows_by_location[location_id] = []
            ordered_locations.append(location_id)
        rows_by_location[location_id].append(row)

    dashboard: list[dict[str, Any]] = []
    for location_id in ordered_locations:
        location_rows = rows_by_location.get(location_id, [])
        if not location_rows:
            continue
        base_row = dict(location_rows[0])
        merged_all_rows = [_merge_product_row(row) for row in location_rows]
        merged_slots: list[dict[str, Any]] = []
        for row_index, merged_row in enumerate(merged_all_rows, start=1):
            code = merged_row.get("_product_code_norm")
            if code and code != "Vazio":
                merged_row["_instance_id"] = f"plano::{location_id}::{row_index}::{code}"
                merged_slots.append(merged_row)

        merged_slots = merged_slots[:2]
        slot_count = len(merged_slots)
        slot_duplo = "SIM" if slot_count >= 2 else "NAO"
        slot1 = merged_slots[0] if slot_count >= 1 else None
        slot2 = merged_slots[1] if slot_count >= 2 else None

        merged_bin = dict(base_row)
        merged_bin["location_id"] = location_id
        merged_bin["slot_count"] = slot_count
        merged_bin["slot_duplo"] = slot_duplo
        merged_bin["slot1_code"] = normalize_string(slot1.get("product_code")) if slot1 else ""
        merged_bin["slot2_code"] = normalize_string(slot2.get("product_code")) if slot2 else ""
        merged_bin["slot1_info_hover"] = slot1.get("info_hover") if slot1 else ""
        merged_bin["slot2_info_hover"] = slot2.get("info_hover") if slot2 else ""
        merged_bin["slot1_subcategoria"] = normalize_string(slot1.get("subcategoria")) if slot1 else ""
        merged_bin["slot2_subcategoria"] = normalize_string(slot2.get("subcategoria")) if slot2 else ""
        merged_bin["slot1_name"] = slot1.get("product_name") if slot1 else ""
        merged_bin["slot2_name"] = slot2.get("product_name") if slot2 else ""
        merged_bin["slot1_instance_id"] = slot1.get("_instance_id") if slot1 else ""
        merged_bin["slot2_instance_id"] = slot2.get("_instance_id") if slot2 else ""
        merged_bin["slot1_quantidade"] = slot1.get("quantidade") if slot1 else None
        merged_bin["slot2_quantidade"] = slot2.get("quantidade") if slot2 else None
        merged_bin["slot1_grupo"] = slot1.get("grupo") if slot1 else ""
        merged_bin["slot2_grupo"] = slot2.get("grupo") if slot2 else ""
        merged_bin["slot1_cor_grupo"] = slot1.get("cor_grupo") if slot1 else COR_MAP_GRUPO["vazio"]
        merged_bin["slot2_cor_grupo"] = slot2.get("cor_grupo") if slot2 else ""
        merged_bin["slot1_curva"] = _curve_letter(slot1.get("curva"), slot1.get("nm_fabricante")) if slot1 else ""
        merged_bin["slot2_curva"] = _curve_letter(slot2.get("curva"), slot2.get("nm_fabricante")) if slot2 else ""
        merged_bin["slot1_vol_l_unitario"] = (
            parse_number(slot1.get("vol_L_unitario") or slot1.get("vol_l_unitario"))
            if slot1
            else None
        )
        merged_bin["slot2_vol_l_unitario"] = (
            parse_number(slot2.get("vol_L_unitario") or slot2.get("vol_l_unitario"))
            if slot2
            else None
        )

        primary = slot1
        if primary:
            merged_bin.update(primary)
        else:
            merged_bin["product_code"] = "Vazio"
            merged_bin["product_name"] = ""
            merged_bin["curva"] = ""
            merged_bin["grupo"] = "Vazio"
            merged_bin["categoria_armazenagem"] = ""
            merged_bin["quantidade"] = None
            merged_bin["venda_total"] = None
            merged_bin["nm_fabricante"] = ""
            merged_bin["altura_cm"] = None
            merged_bin["peso_kg_unitario"] = None
            merged_bin["subcategoria"] = ""
            merged_bin["is_pesado"] = False
            merged_bin["is_alto"] = False
            merged_bin["is_pequeno"] = False
            merged_bin["is_fragil"] = ""
            merged_bin["degelo"] = ""
            merged_bin["info_hover"] = "<b>Escaninho Vazio</b>"
            merged_bin["cor_grupo"] = COR_MAP_GRUPO["vazio"]

        merged_bin["slot_count"] = slot_count
        merged_bin["slot_duplo"] = slot_duplo
        dashboard.append(merged_bin)

    return dashboard


def _normalize_group(value: Any) -> str:
    text = normalize_string(value).lower()
    if not text:
        return ""
    return (
        text.replace("á", "a")
        .replace("à", "a")
        .replace("â", "a")
        .replace("ã", "a")
        .replace("é", "e")
        .replace("ê", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ô", "o")
        .replace("õ", "o")
        .replace("ú", "u")
        .replace("ç", "c")
    )


def _normalize_category(value: Any) -> str:
    text = _normalize_group(value)
    return text.replace(" ", "_")


def _extract_level_value(row: dict[str, Any]) -> int | None:
    level_val = parse_number(row.get("nivel"))
    if level_val is not None:
        try:
            return int(level_val)
        except (TypeError, ValueError):
            return None
    location_id = normalize_string(row.get("location_id"))
    if location_id:
        match = re.search(r"-([0-9]+)[A-Z]+$", location_id.upper())
        if match:
            try:
                return int(match.group(1))
            except (TypeError, ValueError):
                return None
    return None


def _sum_required_bins(base_produtos_map: dict[str, dict[str, Any]]) -> int:
    total = 0
    for row in base_produtos_map.values():
        code = normalize_string(row.get("product_code"))
        if not code or code == "Vazio":
            continue
        esc = _required_bins_from_row(row)
        total += esc
    return total


def _sum_required_bins_by_group(base_produtos_map: dict[str, dict[str, Any]]) -> dict[str, int]:
    totals: dict[str, int] = {}
    for row in base_produtos_map.values():
        code = normalize_string(row.get("product_code"))
        if not code or code == "Vazio":
            continue
        group = _map_storage_to_group_equip_type(row.get("categoria_armazenagem"))
        required = _required_bins_from_row(row)
        totals[group] = totals.get(group, 0) + required
    return totals


def _required_bins_from_row(row: dict[str, Any]) -> int:
    esc_val = parse_number(row.get("escaninhos_necessarios"))
    if esc_val is None:
        esc = 1
    else:
        try:
            esc = int(math.ceil(float(esc_val)))
        except Exception:
            esc = int(round(esc_val))
    if esc < 1:
        esc = 1
    return esc


def _normalize_equip_type(value: Any) -> str:
    text = normalize_string(value).lower()
    if not text:
        return ""
    return text.replace(" ", "_")


def _group_equip_type(value: Any) -> str:
    text = _normalize_equip_type(value)
    if not text:
        return ""
    if "prateleira" in text:
        return "prateleira"
    if "geladeira" in text or "freezer" in text:
        return "refrigerador"
    return text


def _map_storage_to_group_equip_type(value: Any) -> str:
    text = _normalize_category(value)
    if not text:
        return "desconhecido"
    if "prateleira" in text:
        return "prateleira"
    if "geladeira" in text or "freezer" in text or "picol" in text or "sorvet" in text:
        return "refrigerador"
    return text


def _extract_curve_letter(row: dict[str, Any]) -> str:
    curva_letter = _curve_letter(row.get("curva"), row.get("nm_fabricante"))
    if curva_letter:
        return curva_letter
    curva_raw = normalize_string(row.get("curva")).upper()
    if curva_raw and len(curva_raw) == 1 and curva_raw.isalpha():
        return curva_raw
    return "N/A"


def _is_geladeira_category(value: Any) -> bool:
    text = _normalize_category(value)
    return "geladeira" in text


def _estimate_equip_needed(required_bins: int, capacities: list[int]) -> tuple[int, int]:
    if required_bins <= 0:
        return 0, 0
    if not capacities:
        return 0, required_bins
    total = 0
    count = 0
    for cap in sorted(capacities, reverse=True):
        total += cap
        count += 1
        if total >= required_bins:
            return count, 0
    return count, max(0, required_bins - total)


def _best_state(a: tuple[int, int, int, int, int], b: tuple[int, int, int, int, int]) -> bool:
    return (a[0], a[1], a[2], a[3]) < (b[0], b[1], b[2], b[3])


def _select_quimico_shelves(
    shelf_caps: list[dict[str, Any]],
    required_quimico_bins: int,
) -> tuple[set[int], dict[str, Any]]:
    if required_quimico_bins <= 0:
        return set(), {
            "fits": True,
            "required_bins": 0,
            "selected_capacity": 0,
            "shortfall_bins": 0,
            "selected_count": 0,
        }
    if not shelf_caps:
        return set(), {
            "fits": False,
            "required_bins": required_quimico_bins,
            "selected_capacity": 0,
            "shortfall_bins": required_quimico_bins,
            "selected_count": 0,
        }

    total_quim_cap = sum(max(0, int(parse_number(e.get("bins_all")) or 0)) for e in shelf_caps)
    if total_quim_cap <= 0:
        return set(), {
            "fits": False,
            "required_bins": required_quimico_bins,
            "selected_capacity": 0,
            "shortfall_bins": required_quimico_bins,
            "selected_count": 0,
        }

    dp: list[tuple[int, int, int, int, int] | None] = [None] * (total_quim_cap + 1)
    dp[0] = (0, 0, 0, 0, 0)

    for idx, equip in enumerate(shelf_caps):
        cap_all = max(0, int(parse_number(equip.get("bins_all")) or 0))
        if cap_all <= 0:
            continue
        loss_3 = max(0, int(parse_number(equip.get("bins_1_3")) or 0))
        loss_4 = max(0, int(parse_number(equip.get("bins_1_4")) or 0))
        loss_5 = cap_all
        bitmask = 1 << idx
        next_dp = dp[:]
        for cap, state in enumerate(dp):
            if state is None:
                continue
            new_cap = cap + cap_all
            if new_cap > total_quim_cap:
                new_cap = total_quim_cap
            candidate = (
                state[0] + loss_3,
                state[1] + loss_4,
                state[2] + loss_5,
                state[3] + 1,
                state[4] | bitmask,
            )
            current = next_dp[new_cap]
            if current is None or _best_state(candidate, current):
                next_dp[new_cap] = candidate
        dp = next_dp

    target_cap = min(required_quimico_bins, total_quim_cap)
    best_state: tuple[int, int, int, int, int] | None = None
    best_cap = target_cap
    for cap in range(target_cap, total_quim_cap + 1):
        state = dp[cap]
        if state is None:
            continue
        if best_state is None or _best_state(state, best_state):
            best_state = state
            best_cap = cap

    if best_state is None:
        return set(), {
            "fits": False,
            "required_bins": required_quimico_bins,
            "selected_capacity": 0,
            "shortfall_bins": required_quimico_bins,
            "selected_count": 0,
        }

    selected_idxs: set[int] = set()
    mask = best_state[4]
    bit = 0
    while mask:
        if mask & 1:
            selected_idxs.add(bit)
        mask >>= 1
        bit += 1

    return selected_idxs, {
        "fits": best_cap >= required_quimico_bins,
        "required_bins": required_quimico_bins,
        "selected_capacity": best_cap,
        "shortfall_bins": max(0, required_quimico_bins - best_cap),
        "selected_count": best_state[3],
    }


def _minimal_level_upgrades(
    deficit_bins: int,
    deltas: list[tuple[int, str]],
) -> tuple[int, int, list[str]]:
    if deficit_bins <= 0:
        return 0, 0, []
    positive = [(max(0, int(delta)), equip_id) for delta, equip_id in deltas if max(0, int(delta)) > 0]
    if not positive:
        return 0, deficit_bins, []
    positive.sort(key=lambda item: item[0], reverse=True)
    covered = 0
    selected: list[str] = []
    for delta, equip_id in positive:
        covered += delta
        selected.append(equip_id)
        if covered >= deficit_bins:
            return len(selected), 0, selected
    return len(selected), max(0, deficit_bins - covered), selected


def _compute_prateleira_level_plan(
    equip_level_caps: list[dict[str, Any]],
    base_produtos_map: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    shelf_caps: list[dict[str, Any]] = []
    for equip in equip_level_caps:
        if equip.get("tipo") != "prateleira":
            continue
        c3 = max(0, int(parse_number(equip.get("bins_1_3")) or 0))
        c4 = max(c3, int(parse_number(equip.get("bins_1_4")) or 0))
        c5 = max(c4, int(parse_number(equip.get("bins_all")) or 0))
        shelf_caps.append(
            {
                "equipId": equip.get("equipId"),
                "bins_1_3": c3,
                "bins_1_4": c4,
                "bins_all": c5,
            }
        )

    required_quimico = 0
    required_non_quimico = 0
    for row in base_produtos_map.values():
        code = normalize_string(row.get("product_code"))
        if not code or code == "Vazio":
            continue
        if _map_storage_to_group_equip_type(row.get("categoria_armazenagem")) != "prateleira":
            continue
        required = _required_bins_from_row(row)
        grupo_norm = _normalize_group(row.get("grupo"))
        if grupo_norm in {"quimico", "quimicos"}:
            required_quimico += required
        else:
            required_non_quimico += required

    total_equip = len(shelf_caps)
    if total_equip == 0:
        return {
            "total_equip": 0,
            "required_bins_quimico": required_quimico,
            "required_bins_non_quimico": required_non_quimico,
            "quimico": {
                "fits": required_quimico == 0,
                "required_bins": required_quimico,
                "capacity_bins": 0,
                "shortfall_bins": required_quimico,
                "equip_count": 0,
                "equip_ids": [],
            },
            "non_quimico": {
                "fits_3_levels": required_non_quimico == 0,
                "fits_4_levels": required_non_quimico == 0,
                "fits_5_levels": required_non_quimico == 0,
                "required_bins": required_non_quimico,
                "capacity_3_levels": 0,
                "capacity_4_levels": 0,
                "capacity_5_levels": 0,
                "need_4_levels_count": 0,
                "need_5_levels_count": 0,
                "shortfall_3_levels": required_non_quimico,
                "shortfall_4_levels": required_non_quimico,
                "shortfall_5_levels": required_non_quimico,
                "equip_ids_level4": [],
                "equip_ids_level5": [],
            },
        }

    selected_quim_idxs, quim_info = _select_quimico_shelves(shelf_caps, required_quimico)
    quim_equip_ids = [shelf_caps[idx].get("equipId") for idx in sorted(selected_quim_idxs)]
    remaining = [e for idx, e in enumerate(shelf_caps) if idx not in selected_quim_idxs]

    cap3 = sum(e["bins_1_3"] for e in remaining)
    cap4 = sum(e["bins_1_4"] for e in remaining)
    cap5 = sum(e["bins_all"] for e in remaining)
    short3 = max(0, required_non_quimico - cap3)
    short4 = max(0, required_non_quimico - cap4)
    short5 = max(0, required_non_quimico - cap5)

    deltas4 = [(e["bins_1_4"] - e["bins_1_3"], str(e.get("equipId") or "")) for e in remaining]
    need4_count, missing4_after_upgrades, equip_ids_level4 = _minimal_level_upgrades(short3, deltas4)

    deltas5 = [(e["bins_all"] - e["bins_1_4"], str(e.get("equipId") or "")) for e in remaining]
    need5_count, missing5_after_upgrades, equip_ids_level5 = _minimal_level_upgrades(short4, deltas5)

    quim_fits = bool(quim_info.get("fits"))
    fits3 = quim_fits and short3 == 0
    fits4 = quim_fits and short4 == 0 and missing4_after_upgrades == 0
    fits5 = quim_fits and short5 == 0 and missing5_after_upgrades == 0

    return {
        "total_equip": total_equip,
        "required_bins_quimico": required_quimico,
        "required_bins_non_quimico": required_non_quimico,
        "quimico": {
            "fits": quim_fits,
            "required_bins": required_quimico,
            "capacity_bins": quim_info.get("selected_capacity", 0),
            "shortfall_bins": quim_info.get("shortfall_bins", 0),
            "equip_count": quim_info.get("selected_count", 0),
            "equip_ids": [equip_id for equip_id in quim_equip_ids if equip_id],
        },
        "non_quimico": {
            "fits_3_levels": fits3,
            "fits_4_levels": fits4,
            "fits_5_levels": fits5,
            "required_bins": required_non_quimico,
            "capacity_3_levels": cap3,
            "capacity_4_levels": cap4,
            "capacity_5_levels": cap5,
            "need_4_levels_count": need4_count if short3 > 0 else 0,
            "need_5_levels_count": need5_count if short4 > 0 else 0,
            "shortfall_3_levels": short3,
            "shortfall_4_levels": short4,
            "shortfall_5_levels": short5,
            "equip_ids_level4": [equip_id for equip_id in equip_ids_level4 if equip_id],
            "equip_ids_level5": [equip_id for equip_id in equip_ids_level5 if equip_id],
        },
    }


def _compute_metrics(
    dashboard_data: list[dict[str, Any]],
    base_produtos_map: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "totalEscaninhos": 0,
        "escaninhosOcupados": 0,
        "ocupacaoGlobal": 0,
        "skusAlocados": set(),
        "totalSKUs": 0,
        "totalNaoAlocados": 0,
        "porRua": {},
        "porTipoEquip": {},
    }
    escaninhos_por_equip: dict[str, dict[str, Any]] = {}

    bins_level_1_3 = 0
    bins_level_2_plus = 0

    for row in dashboard_data:
        slot_entries: list[tuple[str, str, str]] = []
        slot1_code = normalize_string(row.get("slot1_code") or row.get("product_code"))
        slot2_code = normalize_string(row.get("slot2_code"))
        if slot1_code and slot1_code != "Vazio":
            slot_entries.append(
                (
                    slot1_code,
                    _curve_letter(row.get("curva"), row.get("nm_fabricante")),
                    _normalize_group(row.get("grupo") or row.get("grupo_alocado")),
                )
            )
        if slot2_code and slot2_code != "Vazio":
            slot_entries.append(
                (
                    slot2_code,
                    _curve_letter(row.get("slot2_curva"), None),
                    _normalize_group(row.get("slot2_grupo")),
                )
            )

        rua_num = row.get("rua_num")
        try:
            rua_int = int(rua_num)
        except (TypeError, ValueError):
            continue
        rua_str = str(rua_int)
        equip_num = row.get("equipamento_num")
        equip_id = f"R{rua_str}-{int(equip_num):03d}"
        tipo_equip = row.get("tipo_equipamento_final") or row.get("tipo_equipamento")
        tipo_raw_norm = _normalize_equip_type(tipo_equip)

        metrics["totalEscaninhos"] += 1
        if rua_str not in metrics["porRua"]:
            metrics["porRua"][rua_str] = {
                "totalEscaninhos": 0,
                "escaninhosOcupados": 0,
                "skus": set(),
                "ocupacao": 0,
            }
        if tipo_equip not in metrics["porTipoEquip"]:
            metrics["porTipoEquip"][tipo_equip] = {
                "equipamentos": set(),
                "totalEquip": 0,
                "totalVazios": 0,
                "totalCurvaA": 0,
                "totalGeladeirasAmarelas": 0,
                "dominantCurveCounts": {},
            }
        if equip_id not in escaninhos_por_equip:
            escaninhos_por_equip[equip_id] = {
                "tipo": tipo_equip,
                "tipo_raw_norm": tipo_raw_norm,
                "totalBins": 0,
                "occupiedBins": 0,
                "skus": 0,
                "curvaA": 0,
                "curveCounts": {},
                "has_quimico": False,
                "has_perfumaria": False,
                "bins_1_3": 0,
                "bins_2_plus": 0,
                "bins_1_4": 0,
            }

        level_val = _extract_level_value(row)
        if level_val is not None:
            if level_val <= 3:
                bins_level_1_3 += 1
            if level_val >= 2:
                bins_level_2_plus += 1
            if level_val <= 3:
                escaninhos_por_equip[equip_id]["bins_1_3"] += 1
            if level_val >= 2:
                escaninhos_por_equip[equip_id]["bins_2_plus"] += 1
            if level_val <= 4:
                escaninhos_por_equip[equip_id]["bins_1_4"] += 1

        metrics["porRua"][rua_str]["totalEscaninhos"] += 1
        metrics["porTipoEquip"][tipo_equip]["equipamentos"].add(equip_id)
        escaninhos_por_equip[equip_id]["totalBins"] += 1

        if slot_entries:
            metrics["escaninhosOcupados"] += 1
            metrics["porRua"][rua_str]["escaninhosOcupados"] += 1
            escaninhos_por_equip[equip_id]["skus"] += 1
            escaninhos_por_equip[equip_id]["occupiedBins"] += 1
            for code, curva_letter, grupo_norm in slot_entries:
                metrics["skusAlocados"].add(code)
                metrics["porRua"][rua_str]["skus"].add(code)
                if curva_letter == "A":
                    escaninhos_por_equip[equip_id]["curvaA"] += 1
                if curva_letter:
                    curve_counts = escaninhos_por_equip[equip_id]["curveCounts"]
                    curve_counts[curva_letter] = curve_counts.get(curva_letter, 0) + 1
                if grupo_norm in {"quimico", "quimicos"}:
                    escaninhos_por_equip[equip_id]["has_quimico"] = True
                if grupo_norm == "perfumaria":
                    escaninhos_por_equip[equip_id]["has_perfumaria"] = True

    metrics["subcategoriaAdjacentes"] = []
    adjacency_pairs = set()
    location_groups: dict[tuple[str, str, str], list[dict[str, Any]]] = {}

    for row in dashboard_data:
        location_id = normalize_string(row.get("location_id"))
        if not location_id:
            continue

        parts = location_id.split("-")
        if len(parts) < 4:
            continue
        rua = parts[1]
        estante = parts[2]
        escaninho = "-".join(parts[3:])
        nivel_match = re.match(r"^(\d+)", escaninho)
        pos_match = re.search(r"([A-Z]+)$", escaninho)
        nivel = nivel_match.group(1) if nivel_match else "0"
        pos = pos_match.group(1) if pos_match else ""
        pos_index = ord(pos[0]) - 65 if pos else -1

        slot_pairs = [
            (
                normalize_string(row.get("slot1_code") or row.get("product_code")),
                normalize_string(row.get("subcategoria")),
            ),
            (
                normalize_string(row.get("slot2_code")),
                normalize_string(row.get("slot2_subcategoria")),
            ),
        ]
        for pcode, subcategoria in slot_pairs:
            if not pcode or pcode == "Vazio":
                continue
            if not subcategoria:
                continue
            key = (rua, estante, nivel)
            location_groups.setdefault(key, []).append(
                {
                    "location_id": location_id,
                    "product_code": pcode,
                    "subcategoria": subcategoria,
                    "pos_index": pos_index,
                }
            )

    for group_items in location_groups.values():
        group_items.sort(key=lambda item: item["pos_index"])
        for idx in range(len(group_items) - 1):
            left = group_items[idx]
            right = group_items[idx + 1]
            if left["subcategoria"] != right["subcategoria"]:
                continue
            if left["product_code"] == right["product_code"]:
                continue
            pair_key = tuple(sorted([left["location_id"], right["location_id"]]))
            if pair_key in adjacency_pairs:
                continue
            adjacency_pairs.add(pair_key)
            metrics["subcategoriaAdjacentes"].append(
                {
                    "locationId1": left["location_id"],
                    "locationId2": right["location_id"],
                    "subcategoria": left["subcategoria"],
                    "productCode1": left["product_code"],
                    "productCode2": right["product_code"],
                }
            )

    metrics["underUtilized"] = []
    dominant_global_counts: dict[str, int] = {}
    quim_perf_curve_counts: dict[str, int] = {}
    quim_curve_counts: dict[str, int] = {}
    perf_curve_counts: dict[str, int] = {}
    quim_perf_total = 0
    quim_total = 0
    perf_total = 0
    capacities_by_type: dict[str, list[int]] = {}
    equip_level_caps: list[dict[str, Any]] = []
    geladeira_alta_caps: list[int] = []
    for equip_id, equip in escaninhos_por_equip.items():
        tipo = equip["tipo"]
        if tipo not in metrics["porTipoEquip"]:
            continue
        if equip["skus"] == 0:
            metrics["porTipoEquip"][tipo]["totalVazios"] += 1
        if equip["skus"] > 0 and (equip["curvaA"] / equip["skus"]) > 0.5:
            metrics["porTipoEquip"][tipo]["totalCurvaA"] += 1

        dominant = None
        max_count = -1
        for key, count in equip["curveCounts"].items():
            if count > max_count:
                max_count = count
                dominant = key
        if dominant:
            dom_map = metrics["porTipoEquip"][tipo]["dominantCurveCounts"]
            dom_map[dominant] = dom_map.get(dominant, 0) + 1
            dominant_global_counts[dominant] = dominant_global_counts.get(dominant, 0) + 1

        has_quim = bool(equip.get("has_quimico"))
        has_perf = bool(equip.get("has_perfumaria"))
        if has_quim or has_perf:
            quim_perf_total += 1
            if dominant:
                quim_perf_curve_counts[dominant] = quim_perf_curve_counts.get(dominant, 0) + 1
        if has_quim:
            quim_total += 1
            if dominant:
                quim_curve_counts[dominant] = quim_curve_counts.get(dominant, 0) + 1
        if has_perf:
            perf_total += 1
            if dominant:
                perf_curve_counts[dominant] = perf_curve_counts.get(dominant, 0) + 1

        occupancy = (equip["occupiedBins"] / equip["totalBins"]) if equip["totalBins"] else 0
        if occupancy < 0.2:
            metrics["underUtilized"].append({"equipId": equip_id, "occupancy": occupancy})

        cap_total = equip["totalBins"]
        capacities_by_type.setdefault(_group_equip_type(tipo), []).append(cap_total)
        equip_level_caps.append(
            {
                "equipId": equip_id,
                "tipo": _group_equip_type(tipo),
                "tipo_raw": equip.get("tipo_raw_norm") or _normalize_equip_type(tipo),
                "bins_all": cap_total,
                "bins_1_3": equip["bins_1_3"],
                "bins_2_plus": equip["bins_2_plus"],
                "bins_1_4": equip["bins_1_4"],
            }
        )
        if equip.get("tipo_raw_norm") == "geladeira_alta":
            geladeira_alta_caps.append(equip["bins_1_4"])

    metrics["ocupacaoGlobal"] = (
        metrics["escaninhosOcupados"] / metrics["totalEscaninhos"] if metrics["totalEscaninhos"] else 0
    )
    metrics["totalSKUs"] = len(metrics["skusAlocados"])
    metrics["totalMetodoCaixa"] = sum(
        1 for row in base_produtos_map.values() if normalize_string(row.get("metodo")).lower() == "caixa"
    )
    metrics.pop("skusAlocados", None)

    for rua_data in metrics["porRua"].values():
        rua_data["ocupacao"] = (
            rua_data["escaninhosOcupados"] / rua_data["totalEscaninhos"] if rua_data["totalEscaninhos"] else 0
        )
        rua_data["totalSKUs"] = len(rua_data["skus"])
        rua_data.pop("skus", None)

    for tipo_data in metrics["porTipoEquip"].values():
        tipo_data["totalEquip"] = len(tipo_data["equipamentos"])
        tipo_data.pop("equipamentos", None)
        tipo_data.pop("geladeirasAmarelas", None)

    required_bins = _sum_required_bins(base_produtos_map)
    required_bins_by_group = _sum_required_bins_by_group(base_produtos_map)
    total_bins = metrics["totalEscaninhos"]
    metrics["capacityLevels"] = {
        "bins_levels_1_3": bins_level_1_3,
        "bins_levels_2_plus": bins_level_2_plus,
        "bins_all": total_bins,
        "required_bins": required_bins,
        "fits_levels_1_3": required_bins <= bins_level_1_3 if bins_level_1_3 else False,
        "fits_levels_2_plus": required_bins <= bins_level_2_plus if bins_level_2_plus else False,
        "fits_all_levels": required_bins <= total_bins if total_bins else False,
    }
    metrics["dominantCurveCountsGlobal"] = dominant_global_counts
    metrics["equipQuimPerfCurveCounts"] = quim_perf_curve_counts
    metrics["equipQuimPerfTotal"] = quim_perf_total
    metrics["equipQuimicoCurveCounts"] = quim_curve_counts
    metrics["equipPerfumariaCurveCounts"] = perf_curve_counts
    metrics["equipQuimicoTotal"] = quim_total
    metrics["equipPerfumariaTotal"] = perf_total
    metrics["equipLevelCaps"] = equip_level_caps
    metrics["availableEquipByType"] = {
        equip_type: len(caps) for equip_type, caps in capacities_by_type.items()
    }

    planning_req: dict[str, dict[str, int]] = {}
    planning_quimperf_req: dict[str, dict[str, int]] = {}
    for row in base_produtos_map.values():
        code = normalize_string(row.get("product_code"))
        if not code or code == "Vazio":
            continue
        curve = _extract_curve_letter(row)
        equip_type = _map_storage_to_group_equip_type(row.get("categoria_armazenagem"))
        required = _required_bins_from_row(row)
        planning_req.setdefault(equip_type, {})
        planning_req[equip_type][curve] = planning_req[equip_type].get(curve, 0) + required

        group_norm = _normalize_group(row.get("grupo"))
        if group_norm in {"quimico", "quimicos", "perfumaria"}:
            planning_quimperf_req.setdefault(equip_type, {})
            planning_quimperf_req[equip_type][curve] = (
                planning_quimperf_req[equip_type].get(curve, 0) + required
            )

    planning_by_type_curve: dict[str, dict[str, dict[str, Any]]] = {}
    planning_quimperf_by_type_curve: dict[str, dict[str, dict[str, Any]]] = {}
    for equip_type, curves in planning_req.items():
        caps = capacities_by_type.get(equip_type, [])
        planning_by_type_curve[equip_type] = {}
        for curve, req in curves.items():
            equip_needed, shortfall = _estimate_equip_needed(req, caps)
            planning_by_type_curve[equip_type][curve] = {
                "required_bins": req,
                "equip_needed": equip_needed,
                "shortfall": shortfall,
            }

    for equip_type, curves in planning_quimperf_req.items():
        caps = capacities_by_type.get(equip_type, [])
        planning_quimperf_by_type_curve[equip_type] = {}
        for curve, req in curves.items():
            equip_needed, shortfall = _estimate_equip_needed(req, caps)
            planning_quimperf_by_type_curve[equip_type][curve] = {
                "required_bins": req,
                "equip_needed": equip_needed,
                "shortfall": shortfall,
            }

    planning_by_curve: dict[str, dict[str, Any]] = {}
    for equip_type, curves in planning_by_type_curve.items():
        for curve, info in curves.items():
            bucket = planning_by_curve.setdefault(
                curve,
                {"required_bins": 0, "equip_needed_total": 0, "shortfall_total": 0, "equip_by_type": {}},
            )
            bucket["required_bins"] += info["required_bins"]
            bucket["equip_needed_total"] += info["equip_needed"]
            bucket["shortfall_total"] += info["shortfall"]
            bucket["equip_by_type"][equip_type] = info["equip_needed"]

    planning_quimperf_by_curve: dict[str, dict[str, Any]] = {}
    for equip_type, curves in planning_quimperf_by_type_curve.items():
        for curve, info in curves.items():
            bucket = planning_quimperf_by_curve.setdefault(
                curve,
                {"required_bins": 0, "equip_needed_total": 0, "shortfall_total": 0, "equip_by_type": {}},
            )
            bucket["required_bins"] += info["required_bins"]
            bucket["equip_needed_total"] += info["equip_needed"]
            bucket["shortfall_total"] += info["shortfall"]
            bucket["equip_by_type"][equip_type] = info["equip_needed"]

    metrics["capacityLevelsPrateleira"] = {
        "bins_levels_1_3": sum(e["bins_1_3"] for e in equip_level_caps if e["tipo"] == "prateleira"),
        "bins_levels_2_plus": sum(e["bins_2_plus"] for e in equip_level_caps if e["tipo"] == "prateleira"),
        "bins_all": sum(e["bins_all"] for e in equip_level_caps if e["tipo"] == "prateleira"),
        "required_bins": required_bins_by_group.get("prateleira", 0),
    }
    metrics["prateleiraLevelPlan"] = _compute_prateleira_level_plan(equip_level_caps, base_produtos_map)

    alto_refrigerado_required = 0
    for row in base_produtos_map.values():
        if not parse_bool_flag(row.get("is_alto")):
            continue
        if not _is_geladeira_category(row.get("categoria_armazenagem")):
            continue
        alto_refrigerado_required += _required_bins_from_row(row)

    geladeira_alta_needed, geladeira_alta_short = _estimate_equip_needed(
        alto_refrigerado_required, geladeira_alta_caps
    )
    metrics["geladeiraAltaPlanning"] = {
        "required_bins": alto_refrigerado_required,
        "equip_needed": geladeira_alta_needed,
        "equip_available": len(geladeira_alta_caps),
        "shortfall_bins": geladeira_alta_short,
        "capacity_total": sum(geladeira_alta_caps),
    }

    metrics["planning"] = {
        "by_type_curve": planning_by_type_curve,
        "by_curve": planning_by_curve,
        "quim_perf_by_type_curve": planning_quimperf_by_type_curve,
        "quim_perf_by_curve": planning_quimperf_by_curve,
    }

    return metrics


def _build_content_html(
    dashboard_data: list[dict[str, Any]],
    base_produtos_map: dict[str, dict[str, Any]],
    metrics: dict[str, Any],
) -> str:
    def _format_street_label(value: Any) -> str:
        raw = normalize_string(value).upper().strip()
        if not raw:
            return "R?"
        return f"R{int(raw)}" if raw.isdigit() else f"R{raw}"

    def _street_sort_key(value: Any) -> tuple[int, int, str]:
        raw = normalize_string(value).upper().strip()
        if raw.isdigit():
            return (1, int(raw), raw)
        return (0, 0, raw)

    def _row_street_key(row: dict[str, Any]) -> str:
        raw = normalize_string(row.get("rua_num")).upper().strip()
        if raw:
            return raw
        match = re.search(r"-R([A-Z0-9]+)-", normalize_string(row.get("location_id")).upper())
        return match.group(1) if match else ""

    def _location_sort_key(location_id: str) -> tuple[int, int, int, str]:
        match = re.search(r"-R([A-Z0-9]+)-(\d+)-(\d+)([A-Za-z]+)$", normalize_string(location_id))
        if not match:
            return (9999, 9999, 9999, location_id)
        street_key = _street_sort_key(match.group(1))
        return (
            street_key[0] * 10000 + street_key[1],
            int(match.group(2)),
            int(match.group(3)),
            match.group(4).upper(),
        )

    def _slot_used_volume(row: dict[str, Any], code: str, slot_prefix: str) -> float:
        if not code or code == "Vazio":
            return 0.0
        explicit = parse_number(row.get(f"{slot_prefix}_volume_neste_escaninho_l"))
        if explicit is not None:
            return explicit
        source = base_produtos_map.get(code, {})
        model = _resolve_slot_volume_model(row, source or row)
        quantity_in_bin = parse_number(row.get(f"{slot_prefix}_quantidade_neste_escaninho"))
        if quantity_in_bin is not None:
            return quantity_in_bin * model["logical_unit_volume_l"]
        required = max(1, required_bins_by_code.get(code, model["required_bins"]))
        quantity_fallback = model["logical_count_total"] / required if required > 0 else model["logical_count_total"]
        return quantity_fallback * model["logical_unit_volume_l"]

    def _required_hint(info_html: str, allocated: int, required: int, missing: int) -> str:
        if required <= 1:
            return info_html
        status = (
            f"<br><span style='color:#facc15;font-weight:700;'>⚠ Faltam {missing} escaninho(s)</span>"
            if missing > 0
            else "<br><span style='color:#86efac;font-weight:700;'>✓ Escaninhos completos</span>"
        )
        return f"{info_html}<br><b>Escaninhos no mapa:</b> {allocated}/{required}{status}"

    allocated_slots_by_code: dict[str, int] = {}
    required_bins_by_code: dict[str, int] = {}
    slot_metrics_by_key: dict[tuple[str, str, str], dict[str, float | str | int]] = {}
    placements_by_code: dict[str, list[dict[str, Any]]] = {}
    for code, info in base_produtos_map.items():
        code_norm = normalize_string(code)
        if not code_norm or code_norm == "Vazio":
            continue
        required_bins_by_code[code_norm] = max(1, _required_bins_from_row(info))

    for row in dashboard_data:
        slot_candidates = [
            (
                normalize_string(row.get("slot1_code") or row.get("product_code")),
            ),
            (
                normalize_string(row.get("slot2_code")),
            ),
        ]
        for (code,) in slot_candidates:
            if not code or code == "Vazio":
                continue
            allocated_slots_by_code[code] = allocated_slots_by_code.get(code, 0) + 1
        location_id = normalize_string(row.get("location_id"))
        capacidade = parse_number(row.get("capacidade_l")) or 0.0
        slot1 = normalize_string(row.get("slot1_code") or row.get("product_code"))
        if slot1 and slot1 != "Vazio":
            placements_by_code.setdefault(slot1, []).append(
                {"location_id": location_id, "slot_prefix": "slot1", "capacity_l": capacidade}
            )
        slot2 = normalize_string(row.get("slot2_code"))
        if slot2 and slot2 != "Vazio":
            placements_by_code.setdefault(slot2, []).append(
                {"location_id": location_id, "slot_prefix": "slot2", "capacity_l": capacidade}
            )

    for code, placements in placements_by_code.items():
        placements.sort(key=lambda item: (_location_sort_key(item["location_id"]), item["slot_prefix"]))
        source = base_produtos_map.get(code, {})
        model = _resolve_slot_volume_model(source, source)
        capacities = [parse_number(item.get("capacity_l")) or 0.0 for item in placements]
        distribution = _cascade_slot_distribution(
            model["logical_count_total"],
            model["logical_unit_volume_l"],
            capacities,
        )
        for index, item in enumerate(placements):
            qty_in_bin = distribution[index] if index < len(distribution) else 0.0
            slot_metrics_by_key[(item["location_id"], item["slot_prefix"], code)] = {
                "metodo": model["metodo"],
                "required_bins": model["required_bins"],
                "logical_count_total": model["logical_count_total"],
                "logical_unit_volume_l": model["logical_unit_volume_l"],
                "volume_total_l": model["volume_total_l"],
                "quantidade_neste_escaninho": qty_in_bin,
                "volume_neste_escaninho_l": qty_in_bin * model["logical_unit_volume_l"],
                "placement_index": index + 1,
            }

    ruas: dict[str, list[dict[str, Any]]] = {}
    for row in dashboard_data:
        rua_num = _row_street_key(row)
        if not rua_num:
            continue
        ruas.setdefault(rua_num, []).append(row)

    content_html = ""
    for rua_num in sorted(ruas.keys(), key=_street_sort_key):
        rua_group = ruas[rua_num]
        rua_label = _format_street_label(rua_num)
        content_html += f'<div class="rua" data-rua-num="{escape_html(rua_num)}"><h3>{escape_html(rua_label)}</h3>'
        content_html += (
            f'<div class="add-equip-form" id="add-form-{escape_html(rua_label)}" data-rua-num="{escape_html(rua_num)}">'
            "<span>Criar Equipamento:</span>"
            '<input type="number" placeholder="Nº Equip." class="add-equip-num">'
            '<select class="add-equip-type">'
            '<option value="">Selecione o tipo...</option>'
            "</select>"
            '<button class="add-equip-btn" title="Criar Equipamento">Criar</button>'
            "</div>"
        )
        content_html += '<div class="equipamentos-container">'

        equipamentos: dict[int, list[dict[str, Any]]] = {}
        for row in rua_group:
            try:
                equip_num = int(row.get("equipamento_num"))
            except (TypeError, ValueError):
                continue
            equipamentos.setdefault(equip_num, []).append(row)

        for equip_num in sorted(equipamentos.keys()):
            equip_group = equipamentos[equip_num]
            info_equip = equip_group[0]
            equip_id = f"{rua_label}-{int(equip_num):03d}"
            tipo_equip_final = info_equip.get("tipo_equipamento_final") or info_equip.get("tipo_equipamento")
            tipo_equip_final = normalize_string(tipo_equip_final)
            only_in_cadastro = bool(info_equip.get("card175_only_in_cadastro"))
            only_in_plan = bool(info_equip.get("card175_only_in_plan"))

            has_quimico = any(
                normalize_string(row.get("grupo")) == "quimico" for row in equip_group
            )
            equip_color = "#c0392b" if has_quimico else COR_MAP_EQUIP.get(tipo_equip_final, COR_MAP_EQUIP["default"])

            total_bins = len(equip_group)
            occupied_bins = len([row for row in equip_group if row.get("product_code") and row.get("product_code") != "Vazio"])
            ocupacao_equip = (occupied_bins / total_bins) if total_bins else 0
            data_ocupacao_attr = f'data-ocupacao="{ocupacao_equip:.2f}"'

            bins_by_level_pos: dict[str, dict[int, dict[str, Any]]] = {}
            max_pos = 0
            level_order: list[str] = []
            for bin_info in equip_group:
                level = normalize_string(bin_info.get("nivel"))
                pos = bin_info.get("escaninho_num_no_nivel")
                try:
                    pos_num = int(pos)
                except (TypeError, ValueError):
                    continue
                if level not in bins_by_level_pos:
                    bins_by_level_pos[level] = {}
                    level_order.append(level)
                bins_by_level_pos[level][pos_num] = bin_info
                if pos_num > max_pos:
                    max_pos = pos_num

            level_order.sort()
            level_nums = [int(lvl) for lvl in level_order if str(lvl).isdigit()]
            min_level = min(level_nums) if level_nums else None
            max_level = max(level_nums) if level_nums else None

            tipo_equip_norm = normalize_string(tipo_equip_final).lower().replace(" ", "_")
            is_shelf_heavy_pref = tipo_equip_norm in {"prateleira", "prateleira_alta"}

            num_rows = len(level_order)
            num_cols = max_pos
            if num_rows == 0 or num_cols == 0:
                continue

            # For equipment only in the plan (not in cadastro), only show positions
            # that actually appear in the 175 data — never pad with empty cells.
            if only_in_plan:
                actual_positions: list[int] = sorted(
                    {pos for level_bins in bins_by_level_pos.values() for pos in level_bins}
                )
                pos_to_col = {pos: col_idx for col_idx, pos in enumerate(actual_positions, start=1)}
                num_cols_display = len(actual_positions)
            else:
                actual_positions = list(range(1, max_pos + 1))
                pos_to_col = {pos: pos for pos in actual_positions}
                num_cols_display = num_cols

            equip_grid_html = (
                f'<div class="equipamento-grid" style="--num-cols: {num_cols_display + 1}; --num-rows: {num_rows + 1};">'
            )
            equip_grid_html += '<div class="grid-cell header-cell corner-cell"></div>'
            for pos in actual_positions:
                equip_grid_html += f'<div class="grid-cell header-cell col-header">{_position_label(pos)}</div>'

            for visual_row_index in range(1, num_rows + 1):
                level_array_index = num_rows - visual_row_index
                level = level_order[level_array_index]
                equip_grid_html += f'<div class="grid-cell header-cell row-header">{visual_row_index}</div>'
                for j in actual_positions:
                    bin_info = bins_by_level_pos.get(level, {}).get(j)
                    if not bin_info:
                        equip_grid_html += '<div class="grid-cell empty-cell"></div>'
                        continue

                    merged_bin_info = bin_info
                    slot_count = int(parse_number(merged_bin_info.get("slot_count")) or 0)
                    slot1_code = normalize_string(
                        merged_bin_info.get("slot1_code") or merged_bin_info.get("product_code")
                    )
                    slot2_code = normalize_string(merged_bin_info.get("slot2_code"))
                    if slot1_code and slot1_code != "Vazio" and slot_count <= 0:
                        slot_count = 1
                    if slot2_code and slot2_code != "Vazio" and slot_count < 2:
                        slot_count = 2
                    if slot_count <= 0:
                        slot1_code = "Vazio"
                    product_code = slot1_code if slot1_code else "Vazio"

                    slot1_base = base_produtos_map.get(slot1_code, {}) if slot1_code and slot1_code != "Vazio" else {}
                    slot2_base = base_produtos_map.get(slot2_code, {}) if slot2_code and slot2_code != "Vazio" else {}

                    slot1_cor = merged_bin_info.get("slot1_cor_grupo") or merged_bin_info.get("cor_grupo") or COR_MAP_GRUPO["default"]
                    slot2_cor = merged_bin_info.get("slot2_cor_grupo") or COR_MAP_GRUPO["default"]
                    cor_grupo = slot1_cor
                    if slot_count >= 2 and slot2_code and slot2_code != "Vazio":
                        cor_grupo = f"linear-gradient(135deg, {slot1_cor} 0%, {slot1_cor} 49%, {slot2_cor} 51%, {slot2_cor} 100%)"

                    slot1_required = required_bins_by_code.get(slot1_code, 1) if slot1_code and slot1_code != "Vazio" else 0
                    slot2_required = required_bins_by_code.get(slot2_code, 1) if slot2_code and slot2_code != "Vazio" else 0
                    slot1_allocated = allocated_slots_by_code.get(slot1_code, 0) if slot1_code and slot1_code != "Vazio" else 0
                    slot2_allocated = allocated_slots_by_code.get(slot2_code, 0) if slot2_code and slot2_code != "Vazio" else 0
                    slot1_missing = max(0, slot1_required - slot1_allocated) if slot1_required else 0
                    slot2_missing = max(0, slot2_required - slot2_allocated) if slot2_required else 0
                    total_missing = slot1_missing + slot2_missing

                    letra_curva = normalize_string(merged_bin_info.get("slot1_curva"))
                    letra_curva = letra_curva.upper()[:1] if letra_curva else _curve_letter(
                        slot1_base.get("curva") or merged_bin_info.get("curva"),
                        slot1_base.get("nm_fabricante") or merged_bin_info.get("nm_fabricante"),
                    )
                    letra_curva_2 = normalize_string(merged_bin_info.get("slot2_curva"))
                    letra_curva_2 = letra_curva_2.upper()[:1] if letra_curva_2 else _curve_letter(
                        slot2_base.get("curva"),
                        slot2_base.get("nm_fabricante"),
                    )

                    level_num_match = re.search(r"-(\d+)[A-Za-z]+$", normalize_string(bin_info.get("location_id")))
                    nivel_num_attr = level_num_match.group(1) if level_num_match else ""

                    classes = "escaninho grid-cell"
                    if product_code != "Vazio" or (slot2_code and slot2_code != "Vazio"):
                        is_pesado_any = parse_bool_flag(merged_bin_info.get("is_pesado")) or parse_bool_flag(slot2_base.get("is_pesado"))
                        is_alto_any = parse_bool_flag(merged_bin_info.get("is_alto")) or parse_bool_flag(slot2_base.get("is_alto"))
                        is_pequeno_any = parse_bool_flag(merged_bin_info.get("is_pequeno")) or parse_bool_flag(slot2_base.get("is_pequeno"))
                        if is_pesado_any:
                            classes += " pesado"
                        if is_alto_any:
                            classes += " alto"
                        if is_pequeno_any:
                            classes += " pequeno"
                        if is_pesado_any and is_shelf_heavy_pref and min_level is not None and max_level is not None:
                            try:
                                level_for_check = int(nivel_num_attr or bin_info.get("nivel"))
                            except (TypeError, ValueError):
                                level_for_check = None
                            if level_for_check is not None and (level_for_check == min_level or level_for_check == max_level):
                                classes += " pesado-extremo"
                        is_fragil_1 = normalize_string(merged_bin_info.get("is_fragil") or slot1_base.get("is_fragil")).upper()
                        is_fragil_2 = normalize_string(slot2_base.get("is_fragil")).upper()
                        degelo_1 = normalize_string(merged_bin_info.get("degelo") or slot1_base.get("degelo")).upper()
                        degelo_2 = normalize_string(slot2_base.get("degelo")).upper()
                        is_fragil = "SIM" if "SIM" in {is_fragil_1, is_fragil_2} else ""
                        degelo = "NAO" if "NAO" in {degelo_1, degelo_2} else ""
                        if is_fragil == "SIM":
                            classes += " fragil"
                        if degelo == "NAO":
                            classes += " degelo-nao"
                        if slot_count >= 2:
                            classes += " slot-duplo"
                            sub1 = normalize_string(merged_bin_info.get("slot1_subcategoria") or merged_bin_info.get("subcategoria"))
                            sub2 = normalize_string(merged_bin_info.get("slot2_subcategoria"))
                            if sub1 and sub2 and sub1 == sub2 and slot1_code and slot2_code and slot1_code != slot2_code:
                                classes += " slot-subcat-duplicate"
                        if total_missing > 0:
                            classes += " precisa-escaninho-extra"
                    else:
                        is_fragil = ""
                        degelo = ""

                    subcat_segura = escape_html(merged_bin_info.get("subcategoria") or merged_bin_info.get("slot1_subcategoria") or "Vazio")
                    slot2_subcat_segura = escape_html(merged_bin_info.get("slot2_subcategoria") or "")
                    slot1_metrics = slot_metrics_by_key.get((normalize_string(bin_info.get("location_id")), "slot1", slot1_code), {})
                    slot2_metrics = slot_metrics_by_key.get((normalize_string(bin_info.get("location_id")), "slot2", slot2_code), {})
                    for key, value in slot1_metrics.items():
                        merged_bin_info[f"slot1_{key}"] = value
                    for key, value in slot2_metrics.items():
                        merged_bin_info[f"slot2_{key}"] = value
                    if slot1_metrics:
                        merged_bin_info["quantidade_neste_escaninho"] = slot1_metrics.get("quantidade_neste_escaninho")
                        merged_bin_info["volume_neste_escaninho_l"] = slot1_metrics.get("volume_neste_escaninho_l")
                    info_hover_1 = merged_bin_info.get("slot1_info_hover") or merged_bin_info.get("info_hover") or "Info indisponível"
                    info_hover_2 = merged_bin_info.get("slot2_info_hover") or ""
                    if slot1_code and slot1_code != "Vazio":
                        slot1_row = {**merged_bin_info, **{k[6:]: v for k, v in merged_bin_info.items() if k.startswith("slot1_")}}
                        slot1_row["product_code"] = slot1_code
                        slot1_row["quantidade_neste_escaninho"] = slot1_metrics.get("quantidade_neste_escaninho")
                        slot1_row["volume_neste_escaninho_l"] = slot1_metrics.get("volume_neste_escaninho_l")
                        info_hover_1 = _criar_info_hover(slot1_row, base_produtos_map)
                    if slot2_code and slot2_code != "Vazio":
                        slot2_row = {**merged_bin_info, **{k[6:]: v for k, v in merged_bin_info.items() if k.startswith("slot2_")}}
                        slot2_row["product_code"] = slot2_code
                        slot2_row["quantidade_neste_escaninho"] = slot2_metrics.get("quantidade_neste_escaninho")
                        slot2_row["volume_neste_escaninho_l"] = slot2_metrics.get("volume_neste_escaninho_l")
                        info_hover_2 = _criar_info_hover(slot2_row, base_produtos_map)
                    if slot1_code and slot1_code != "Vazio":
                        info_hover_1 = _required_hint(info_hover_1, slot1_allocated, slot1_required, slot1_missing)
                    if slot2_code and slot2_code != "Vazio":
                        info_hover_2 = _required_hint(info_hover_2, slot2_allocated, slot2_required, slot2_missing)
                    capacidade_l = parse_number(merged_bin_info.get("capacidade_l"))
                    used_slot_1 = _slot_used_volume(merged_bin_info, slot1_code, "slot1")
                    used_slot_2 = _slot_used_volume(merged_bin_info, slot2_code, "slot2")
                    over_capacity, cap_value, used_total = _bin_volume_status(capacidade_l, used_slot_1, used_slot_2)
                    if over_capacity:
                        classes += " volume-capacity-violated"
                    info_hover = info_hover_1
                    if slot_count >= 2 and info_hover_2:
                        volume_text = ""
                        if capacidade_l is not None:
                            used = used_slot_1 + used_slot_2
                            volume_text = f"<br><b>Volume usado:</b> {_fmt_measure(used, ' L', 3)} / {_fmt_measure(capacidade_l, ' L', 3)}"
                        warning_text = ""
                        if over_capacity and cap_value is not None and used_total is not None:
                            warning_text = (
                                f"<br><b>⚠ Capacidade violada:</b> "
                                f"{_fmt_measure(used_total, ' L', 3)} / {_fmt_measure(cap_value, ' L', 3)}"
                            )
                        info_hover = (
                            "<b>Escaninho com 2 produtos</b><br>"
                            "<b>Slot 1</b><br>"
                            f"{info_hover_1}"
                            "<hr style='border:0;border-top:1px solid rgba(255,255,255,0.25);margin:6px 0;'>"
                            "<b>Slot 2</b><br>"
                            f"{info_hover_2}"
                            f"{volume_text}"
                            f"{warning_text}"
                        )
                    elif slot1_code and slot1_code != "Vazio" and capacidade_l is not None:
                        warning_text = ""
                        if over_capacity and cap_value is not None and used_total is not None:
                            warning_text = (
                                f"<br><b>⚠ Capacidade violada:</b> "
                                f"{_fmt_measure(used_total, ' L', 3)} / {_fmt_measure(cap_value, ' L', 3)}"
                            )
                        info_hover = (
                            f"{info_hover_1}<br><b>Volume usado:</b> "
                            f"{_fmt_measure(used_slot_1, ' L', 3)} / {_fmt_measure(capacidade_l, ' L', 3)}"
                            f"{warning_text}"
                        )

                    is_fragil_attr = normalize_string(merged_bin_info.get("is_fragil")).upper() if product_code != "Vazio" else ""
                    degelo_attr = normalize_string(merged_bin_info.get("degelo")).upper() if product_code != "Vazio" else ""
                    if slot_count >= 2:
                        is_fragil_attr = "SIM" if "SIM" in {
                            normalize_string(merged_bin_info.get("is_fragil")).upper(),
                            normalize_string(slot2_base.get("is_fragil")).upper(),
                        } else ""
                        degelo_attr = "NAO" if "NAO" in {
                            normalize_string(merged_bin_info.get("degelo")).upper(),
                            normalize_string(slot2_base.get("degelo")).upper(),
                        } else ""

                    visual_content = letra_curva or ""
                    if slot_count >= 2:
                        curve_1 = escape_html(letra_curva or "•")
                        curve_2 = escape_html(letra_curva_2 or "•")
                        visual_content = (
                            '<span class="slot-duplo-wrap">'
                            f'<span class="slot-duplo-badge slot-1">{curve_1}</span>'
                            f'<span class="slot-duplo-badge slot-2">{curve_2}</span>'
                            '</span>'
                            '<span class="slot-duplo-flag">2x</span>'
                        )
                    if total_missing > 0:
                        visual_content += f'<span class="slot-extra-flag">⚠+{total_missing}</span>'
                    if over_capacity:
                        visual_content += '<span class="slot-volume-flag">VOL</span>'

                    equip_grid_html += (
                        f'<div class="{classes}" id="bin-{bin_info.get("location_id")}" '
                        f'data-product-code="{escape_html(product_code)}" '
                        f'data-product-name="{escape_html(merged_bin_info.get("product_name") or "")}" '
                        f'data-slot-count="{slot_count}" '
                        f'data-slot1-code="{escape_html(slot1_code)}" '
                        f'data-slot2-code="{escape_html(slot2_code)}" '
                        f'data-slot1-instance-id="{escape_html(merged_bin_info.get("slot1_instance_id") or "")}" '
                        f'data-slot2-instance-id="{escape_html(merged_bin_info.get("slot2_instance_id") or "")}" '
                        f'data-slot1-required="{slot1_required}" '
                        f'data-slot2-required="{slot2_required}" '
                        f'data-slot1-missing="{slot1_missing}" '
                        f'data-slot2-missing="{slot2_missing}" '
                        f'data-card-address-original="{escape_html(merged_bin_info.get("card788_address_original") or "")}" '
                        f'data-missing-total="{total_missing}" '
                        f'data-volume-over-capacity="{"SIM" if over_capacity else "NAO"}" '
                        f'data-slot-duplo="{escape_html(merged_bin_info.get("slot_duplo") or slot_duplo)}" '
                        f'data-capacidade-l="{escape_html(merged_bin_info.get("capacidade_l") or "")}" '
                        f'data-subcategory="{subcat_segura}" '
                        f'data-slot2-subcategory="{slot2_subcat_segura}" '
                        f'data-equip-type="{escape_html(tipo_equip_final)}" '
                        f'data-cat-armz="{escape_html(merged_bin_info.get("categoria_armazenagem") or "N/A")}" '
                        f'data-fragil="{escape_html(is_fragil_attr)}" '
                        f'data-degelo="{escape_html(degelo_attr)}" '
                        f'data-peso-kg="{escape_html(merged_bin_info.get("peso_kg_unitario") or "")}" '
                        f'data-rua-num="{rua_num}" '
                        f'data-equip-num="{equip_num}" '
                        f'data-level-num="{escape_html(nivel_num_attr)}" '
                        f'style="background: {cor_grupo};" '
                        f'title="{escape_html(bin_info.get("location_id"))}">'
                        f"{visual_content}<span class=\"tooltip\">{info_hover}</span></div>"
                    )

            equip_grid_html += "</div>"

            count_degelo_nao = 0
            for row in equip_group:
                product_code = normalize_string(row.get("product_code"))
                if not product_code or product_code == "Vazio":
                    continue
                product_data = base_produtos_map.get(product_code, {})
                degelo = normalize_string(product_data.get("degelo")).upper()
                if degelo == "NAO":
                    count_degelo_nao += 1

            has_degelo_nao = count_degelo_nao > 5
            degelo_emoji = " ⚡" if has_degelo_nao else ""
            cor_final_equip = equip_color
            if has_degelo_nao and tipo_equip_final in {"geladeira", "geladeira_alta"}:
                cor_final_equip = "#f39c12"
                if tipo_equip_final in metrics.get("porTipoEquip", {}):
                    metrics["porTipoEquip"][tipo_equip_final]["totalGeladeirasAmarelas"] = (
                        metrics["porTipoEquip"][tipo_equip_final].get("totalGeladeirasAmarelas", 0) + 1
                    )

            equip_classes = ["equipamento"]
            status_badge = ""
            if only_in_cadastro:
                equip_classes.append("equipamento-cadastro-only")
                status_badge = '<span class="equip-status-badge equip-status-cadastro-only" title="Equipamento presente no mapa da loja, mas sem endereçamento no Card 788">No mapa, sem 788</span>'
            elif only_in_plan:
                equip_classes.append("equipamento-card175-only")
                status_badge = '<span class="equip-status-badge equip-status-card175-only" title="Equipamento presente no Card 788, mas não cadastrado no mapa da loja">No 788, fora do mapa</span>'

            content_html += (
                f'<div class="{" ".join(equip_classes)}" id="{equip_id}">'
                f'<div class="equipamento-header" style="background-color: {cor_final_equip};" {data_ocupacao_attr}>'
                '<button class="change-type-btn" title="Alterar Tipo de Equipamento">⚙</button>'
                f'<strong>Equip. #{equip_num}{degelo_emoji}</strong><span>({escape_html(tipo_equip_final)})</span>{status_badge}'
                '<button class="remove-equip-btn" title="Remover Equipamento (Mover itens para Prancheta)">×</button>'
                f'</div><div class="micro-view" id="micro-{equip_id}">{equip_grid_html}</div></div>'
            )

        content_html += "</div></div>"

    return content_html


def _build_unallocated_section(
    base_produtos_map: dict[str, dict[str, Any]],
    base_produtos_data: list[dict[str, Any]],
    plano_data: list[dict[str, Any]],
    log_falhas_data: list[dict[str, Any]],
    card175_invalid_data: list[dict[str, Any]],
    metrics: dict[str, Any],
) -> tuple[str, list[dict[str, Any]]]:
    allocated_instances_by_code = Counter(
        normalize_string(row.get("product_code"))
        for row in plano_data
        if row.get("product_code") and row.get("product_code") != "Vazio"
    )
    allocated_codes = {code for code in allocated_instances_by_code if code}

    motivo_falha_map = {}
    for row in log_falhas_data:
        if row.get("product_code") and normalize_string(row.get("status")).lower() == "falha":
            pcode = normalize_string(row.get("product_code"))
            if pcode and pcode not in motivo_falha_map:
                motivo_falha_map[pcode] = row.get("motivo") or "Motivo desconhecido"

    final_unallocated_list = []
    for pcode, product_info in base_produtos_map.items():
        motivo = motivo_falha_map.get(pcode) or "Não alocado (Ausente no Plano Final)"
        esc_raw = normalize_string(product_info.get("escaninhos_necessarios")).replace(",", ".")
        try:
            escaninhos = int(float(esc_raw)) if esc_raw else 1
        except ValueError:
            escaninhos = 1
        if escaninhos < 1:
            escaninhos = 1
        allocated_instances = int(allocated_instances_by_code.get(pcode, 0) or 0)
        missing_instances = max(0, escaninhos - allocated_instances)
        if missing_instances <= 0:
            continue
        has_any_address = allocated_instances > 0
        for i in range(missing_instances):
            final_unallocated_list.append(
                {
                    **product_info,
                    "product_code": pcode,
                    "status": "falha",
                    "motivo": motivo,
                    "escaninho_index": allocated_instances + i + 1,
                    "allocated_instances": allocated_instances,
                    "has_any_address": has_any_address,
                }
            )

    total_linhas_base = len(base_produtos_data)
    metrics["totalNaoAlocados"] = len(final_unallocated_list)

    failed_products_html = ""
    unallocated_products_list: list[dict[str, Any]] = []

    if final_unallocated_list:
        failed_products_html = (
            '<div class="container-falhas"><h2>Produtos Não Alocados '
            '<select id="falhas-selector"><option value="">Selecione um motivo...</option>'
        )
        falhas_por_motivo: dict[str, list[dict[str, Any]]] = {}

        for index, falha in enumerate(final_unallocated_list):
            motivo = falha.get("motivo") or "Motivo desconhecido"
            falhas_por_motivo.setdefault(motivo, []).append(falha)

            product_id = f"unallocated-{index}"
            info_hover_html = _criar_info_hover(falha, base_produtos_map)
            base_info = base_produtos_map.get(falha.get("product_code"), {})
            is_pesado = parse_bool_flag(base_info.get("is_pesado"))
            is_alto = parse_bool_flag(base_info.get("is_alto"))
            is_pequeno = parse_bool_flag(base_info.get("is_pequeno"))
            is_fragil = normalize_string(base_info.get("is_fragil")).upper()
            degelo = normalize_string(base_info.get("degelo")).upper()

            classes = []
            if is_pesado:
                classes.append("pesado")
            if is_alto:
                classes.append("alto")
            if is_pequeno:
                classes.append("pequeno")
            if is_fragil == "SIM":
                classes.append("fragil")
            if degelo == "NAO":
                classes.append("degelo-nao")

            unallocated_products_list.append(
                {
                    "id": product_id,
                    "instance_id": f"unallocated::{falha.get('product_code')}::{index}",
                    "product_code": falha.get("product_code"),
                    "product_name": falha.get("product_name") or "Nome não encontrado",
                    "cor_grupo": COR_MAP_GRUPO.get(
                        normalize_string(falha.get("grupo")), COR_MAP_GRUPO["default"]
                    ),
                    "curva": _curve_letter(falha.get("curva"), falha.get("nm_fabricante")),
                    "info_hover": info_hover_html,
                    "classes": " ".join(classes),
                    "cat_armz": falha.get("categoria_armazenagem"),
                    "is_pesado": is_pesado,
                    "is_alto": is_alto,
                    "is_pequeno": is_pequeno,
                    "is_fragil": is_fragil,
                    "degelo": degelo,
                    "has_any_address": bool(falha.get("has_any_address")),
                    "dataset": {
                        "productCode": falha.get("product_code"),
                        "catArmz": falha.get("categoria_armazenagem") or "N/A",
                        "instanceId": f"unallocated::{falha.get('product_code')}::{index}",
                        "hasAnyAddress": "1" if falha.get("has_any_address") else "0",
                    },
                }
            )

        for idx, motivo in enumerate(falhas_por_motivo.keys()):
            failed_products_html += f'<option value="motivo-{idx}">{escape_html(motivo[:80])}</option>'
        failed_products_html += "</select></h2>"

        for idx, motivo in enumerate(falhas_por_motivo.keys()):
            tabela = falhas_por_motivo[motivo]
            failed_products_html += (
                f'<div id="motivo-{idx}" class="tabela-falhas-container" style="display:none;">'
                f'<h4>{escape_html(motivo)} ({len(tabela)} produtos)</h4>'
                '<table class="tabela-falhas">'
                "<tr><th>Produto</th><th>Código</th><th>Curva</th><th>Cat. Armaz.</th><th>Qtd.</th></tr>"
            )
            for row in tabela:
                curva = _curve_letter(row.get("curva"), row.get("nm_fabricante"))
                failed_products_html += (
                    f"<tr><td>{escape_html(row.get('product_name') or '')}</td>"
                    f"<td>{escape_html(row.get('product_code') or '')}</td>"
                    f"<td>{escape_html(curva)}</td>"
                    f"<td>{escape_html(row.get('categoria_armazenagem') or '')}</td>"
                    f"<td>{int(parse_number(row.get('quantidade')) or 0)}</td></tr>"
                )
            failed_products_html += "</table></div>"

        failed_products_html += "</div>"

    failed_products_html = ""
    return failed_products_html, unallocated_products_list


def _build_products_for_search(dashboard_data: list[dict[str, Any]]) -> tuple[dict[str, list[str]], dict[str, dict[str, Any]]]:
    product_location_map: dict[str, list[str]] = {}
    products_for_search: dict[str, dict[str, Any]] = {}

    for row in dashboard_data:
        rua_raw = normalize_string(row.get("rua_num")).upper().strip()
        if not rua_raw:
            match = re.search(r"-R([A-Z0-9]+)-", normalize_string(row.get("location_id")).upper())
            rua_raw = match.group(1) if match else ""
        try:
            rua_label = f"R{int(rua_raw)}" if rua_raw.isdigit() else f"R{rua_raw}"
            equip_id = f"{rua_label}-{int(row.get('equipamento_num')):03d}"
        except (TypeError, ValueError):
            equip_id = None

        slot_codes = [
            normalize_string(row.get("slot1_code") or row.get("product_code")),
            normalize_string(row.get("slot2_code")),
        ]
        slot_names = [
            row.get("product_name"),
            row.get("slot2_name"),
        ]

        for idx, code in enumerate(slot_codes):
            if not code or code == "Vazio":
                continue
            if equip_id:
                product_location_map.setdefault(code, [])
                if equip_id not in product_location_map[code]:
                    product_location_map[code].append(equip_id)
            product_name = slot_names[idx]
            if product_name and code not in products_for_search:
                products_for_search[code] = {
                    "name": str(product_name),
                    "code": code,
                    "product_name": str(product_name),
                    "grupo": row.get("grupo") or row.get("grupo_alocado"),
                    "categoria_armazenagem": row.get("categoria_armazenagem"),
                    "subcategoria": row.get("subcategoria"),
                    "curva": row.get("curva"),
                    "nm_fabricante": row.get("nm_fabricante"),
                    "card788_address_original": row.get("card788_address_original"),
                }

    return product_location_map, products_for_search


def _normalize_header_key(value: Any) -> str:
    text = normalize_string(value).strip().lower()
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def _norm_code_upper(value: Any) -> str:
    return normalize_string(value).upper()


def _read_first_available_sheet(source: Any, candidates: list[str]) -> list[dict[str, Any]]:
    for candidate in candidates:
        data = load_sheet_safe(source, candidate)
        if data:
            return data
    return []


def _read_multiple_first_available_sheets(
    source: Any,
    candidates_map: dict[str, list[str]],
) -> dict[str, list[dict[str, Any]]]:
    output = {key: [] for key in candidates_map}
    if not candidates_map:
        return output

    if hasattr(source, "read_sheets"):
        all_candidates: list[str] = []
        for candidates in candidates_map.values():
            for candidate in candidates:
                if candidate not in all_candidates:
                    all_candidates.append(candidate)
        try:
            batch = source.read_sheets(all_candidates)
        except Exception:
            batch = {}
        for key, candidates in candidates_map.items():
            for candidate in candidates:
                data = batch.get(candidate, [])
                if data:
                    output[key] = data
                    break
        return output

    for key, candidates in candidates_map.items():
        output[key] = _read_first_available_sheet(source, candidates)
    return output


def _lookup_from_row(row: dict[str, Any], aliases: list[str]) -> Any:
    if not row:
        return None
    norm_map = {_normalize_header_key(k): k for k in row.keys()}
    for alias in aliases:
        key = norm_map.get(_normalize_header_key(alias))
        if key is None:
            continue
        value = row.get(key)
        if normalize_string(value) != "":
            return value
    return None


def _card175_street_key(value: Any) -> str:
    raw = normalize_string(value).upper().strip()
    if not raw:
        return ""
    parsed = parse_number(raw)
    if parsed is not None:
        return str(int(parsed))
    return raw.removeprefix("R")


def _street_sort_key_for_card175(value: Any) -> tuple[int, int, str]:
    raw = _card175_street_key(value)
    if raw.isdigit():
        return (1, int(raw), raw)
    return (0, 0, raw)


def _card175_extract_equip_key(row: dict[str, Any]) -> tuple[str, int] | None:
    rua = _card175_street_key(row.get("rua_num"))
    equip = parse_number(row.get("equipamento_num"))
    if rua and equip is not None:
        return rua, int(equip)

    location_id = normalize_string(row.get("location_id")).upper()
    match = re.search(r"-R([A-Z0-9]+)-(?:E)?(\d+)-", location_id)
    if not match:
        return None
    return _card175_street_key(match.group(1)), int(match.group(2))


def _build_cadastro_equipment_map(cadastro_data: list[dict[str, Any]]) -> dict[tuple[str, int], dict[str, Any]]:
    mapping: dict[tuple[str, int], dict[str, Any]] = {}
    for row in cadastro_data:
        rua = _card175_street_key(_lookup_from_row(row, ["rua_num", "rua"]))
        equip = parse_number(_lookup_from_row(row, ["equipamento_num", "equipamento", "equip_num"]))
        if not rua or equip is None:
            continue
        mapping[(rua, int(equip))] = {
            "rua_num": rua,
            "equipamento_num": int(equip),
            "tipo_equipamento": normalize_string(_lookup_from_row(row, ["tipo_equipamento", "tipo"])).strip(),
            "galpao_id": normalize_string(_lookup_from_row(row, ["galpao_id", "galpao"])).strip(),
        }
    return mapping


def _build_card175_mode_rows(
    plano_data: list[dict[str, Any]],
    cadastro_data: list[dict[str, Any]],
    volumetria_data: list[dict[str, Any]],
    include_cadastro_only: bool = False,
) -> list[dict[str, Any]]:
    cadastro_map = _build_cadastro_equipment_map(cadastro_data)
    volumetria_map = load_volumetria_map(volumetria_data)
    rows_out: list[dict[str, Any]] = []
    plan_keys: set[tuple[str, int]] = set()
    galpao_default = ""

    for row in plano_data:
        equip_key = _card175_extract_equip_key(row)
        if not equip_key:
            continue
        plan_keys.add(equip_key)
        row_copy = dict(row)
        cadastro_info = cadastro_map.get(equip_key)
        if cadastro_info and cadastro_info.get("tipo_equipamento"):
            row_copy["tipo_equipamento"] = cadastro_info["tipo_equipamento"]
            row_copy["tipo_equipamento_final"] = cadastro_info["tipo_equipamento"]
        row_copy["card175_only_in_cadastro"] = False
        row_copy["card175_only_in_plan"] = cadastro_info is None
        rows_out.append(row_copy)
        if not galpao_default:
            galpao_default = normalize_string(row_copy.get("galpao_id")).strip()

    if include_cadastro_only:
        for equip_key, cadastro_info in cadastro_map.items():
            if equip_key in plan_keys:
                continue
            rua_num, equip_num = equip_key
            tipo = normalize_string(cadastro_info.get("tipo_equipamento")).strip() or "desconhecido"
            vol_cfg = volumetria_map.get(tipo.lower(), {})
            qtd_niveis = max(1, int(parse_number(vol_cfg.get("qtd_niveis")) or 1))
            qtd_esc = max(1, int(parse_number(vol_cfg.get("qtd_escaninhos_por_nivel")) or 1))
            capacidade = parse_number(vol_cfg.get("l_por_escaninho")) or 0
            galpao = cadastro_info.get("galpao_id") or galpao_default or "LJ000000"
            for nivel in range(1, qtd_niveis + 1):
                for pos in range(1, qtd_esc + 1):
                    rows_out.append(
                        {
                            "location_id": f"{galpao}-R{rua_num}-{equip_num:03d}-{nivel}{_position_label(pos)}",
                            "galpao_id": galpao,
                            "rua_num": rua_num,
                            "equipamento_num": equip_num,
                            "tipo_equipamento": tipo,
                            "tipo_equipamento_final": tipo,
                            "nivel": nivel,
                            "escaninho_num_no_nivel": pos,
                            "capacidade_l": capacidade,
                            "product_code": "Vazio",
                            "product_name": "",
                            "slot_count": 0,
                            "slot_duplo": "NAO",
                            "card175_only_in_cadastro": True,
                            "card175_only_in_plan": False,
                        }
                    )

    rows_out.sort(
        key=lambda row: (
            _street_sort_key_for_card175(row.get("rua_num")),
            int(parse_number(row.get("equipamento_num")) or 9999),
            int(parse_number(row.get("nivel")) or 9999),
            int(parse_number(row.get("escaninho_num_no_nivel")) or 9999),
        )
    )
    return rows_out


def _read_values_first_available_sheet(source: Any, candidates: list[str]) -> list[list[Any]]:
    clients: list[Any] = []
    if hasattr(source, "client"):
        clients = [getattr(source, "client", None)]
    elif hasattr(source, "primary"):
        clients = [getattr(source, "primary", None), getattr(source, "fallback", None)]
    clients = [client for client in clients if client is not None]
    if not clients:
        return []

    for client in clients:
        try:
            names = client.list_sheet_names()
        except Exception:
            names = []
        norm_map = {_normalize_header_key(name): name for name in names}
        for candidate in candidates:
            real_name = norm_map.get(_normalize_header_key(candidate))
            if not real_name:
                continue
            try:
                values = client.read_values(real_name)
            except Exception:
                continue
            if values:
                return values
    return []


def _first_non_empty_from_indices(row: list[Any], indices: list[int]) -> Any:
    for idx in indices:
        if idx < 0 or idx >= len(row):
            continue
        value = row[idx]
        if normalize_string(value) != "":
            return value
    return None


def _find_header_indices(headers: list[Any], aliases: list[str]) -> list[int]:
    aliases_norm = {_normalize_header_key(alias) for alias in aliases}
    indices: list[int] = []
    for idx, header in enumerate(headers):
        if _normalize_header_key(header) in aliases_norm:
            indices.append(idx)
    return indices


def _extract_sales_maps_from_raw_values(values: list[list[Any]]) -> tuple[dict[str, float], dict[str, float]]:
    if not values or len(values) < 2:
        return {}, {}

    headers = [str(h).strip() if h is not None else "" for h in values[0]]
    code_indices = _find_header_indices(headers, ["cod_produto", "id_produto", "product_code"])
    name_indices = _find_header_indices(headers, ["desc_produto", "descricao_produto", "product_name", "produto"])
    qty_indices = _find_header_indices(headers, ["qtd_total", "sum(ip.qtd_total)", "qtd", "quantidade"])
    if not qty_indices:
        return {}, {}

    by_code: dict[str, float] = {}
    by_name: dict[str, float] = {}
    for raw in values[1:]:
        row = list(raw)
        qty_raw = _first_non_empty_from_indices(row, qty_indices)
        qty = float(parse_number(qty_raw) or 0.0)
        if qty <= 0:
            continue
        code = _norm_code_upper(_first_non_empty_from_indices(row, code_indices))
        name = normalize_string(_first_non_empty_from_indices(row, name_indices)).upper()
        if code:
            by_code[code] = by_code.get(code, 0.0) + qty
        elif name:
            by_name[name] = by_name.get(name, 0.0) + qty
    return by_code, by_name


def _build_lookup_by_code(
    rows: list[dict[str, Any]],
    code_aliases: list[str],
    field_aliases: dict[str, list[str]],
) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        code = _norm_code_upper(_lookup_from_row(row, code_aliases))
        if not code:
            continue
        payload = out.setdefault(code, {})
        for target_key, aliases in field_aliases.items():
            value = _lookup_from_row(row, aliases)
            if normalize_string(value) == "":
                continue
            payload[target_key] = value
    return out


def _enrich_base_map_with_master_etl(
    source: Any,
    base_produtos_map: dict[str, dict[str, Any]],
    dic_cat_map: dict[str, str],
    limite_altura: float,
    limite_altura_baixo: float,
) -> dict[str, dict[str, Any]]:
    if not base_produtos_map:
        return base_produtos_map

    sheets = _read_multiple_first_available_sheets(
        source,
        {
            "degelo": ["Degelo", "degelo"],
            "categoria_gpt": ["Categoria ChatGPT", "Categoria_ChatGPT"],
            "subcat": ["Subcategorias", "Subcategoria"],
            "categoria_site": ["Categoria Site", "Categoria_Site"],
            "volumetria": ["volumetria e fabricantes", "Volumetria e fabricantes", "Volumetria", "volumetria"],
            "fotos": ["Fotos_Produtos", "Fotos Produtos"],
        },
    )
    degelo_rows = sheets["degelo"]
    categoria_gpt_rows = sheets["categoria_gpt"]
    subcat_rows = sheets["subcat"]
    categoria_site_rows = sheets["categoria_site"]
    volumetria_rows = sheets["volumetria"]
    fotos_rows = sheets["fotos"]
    vendas_raw_values = _read_values_first_available_sheet(source, ["Vendas Alvo", "Vendas Pamplona"])

    map_degelo = _build_lookup_by_code(
        degelo_rows,
        ["cod_produto", "product_code", "codigo", "sku"],
        {
            "is_fragil": ["is_fragil", "fragil"],
            "degelo": ["degelo"],
            "prioridade_alocacao": ["prioridade_alocacao", "prioridade"],
            "categoria_armazenagem": ["categoria_armazenagem", "categoria armazenagem", "armazenagem"],
            "subcategoria": ["subcategoria"],
            "categoria_site": ["categoria_site", "categoria"],
            "nm_fabricante": ["nm_fabricante", "fabricante", "marca"],
            "altura_cm": ["altura_cm", "altura"],
            "vol_l_unitario": ["vol_l_unitario", "vol_l_unitario", "vol_unitario_l"],
            "vol_L_unitario": ["vol_L_unitario", "vol_l_unitario", "vol_unitario_l"],
            "curva": ["curva"],
            "venda_total": ["venda_total", "vendas", "venda"],
            "venda_media_diaria": ["venda_media_diaria", "venda_media", "media_diaria"],
            "dias_estoque": ["dias_estoque", "dias"],
            "peso_kg_unitario": ["peso_kg_unitario", "peso_kg", "peso"],
        },
    )
    map_categoria_gpt = _build_lookup_by_code(
        categoria_gpt_rows,
        ["cod_produto", "Cod_Produto", "product_code", "codigo", "sku"],
        {
            "categoria_armazenagem": ["Categoria_Correta", "categoria_correta", "Categoria", "Armazenamento"],
        },
    )
    map_subcat = _build_lookup_by_code(
        subcat_rows,
        ["cod_produto", "product_code", "codigo", "sku"],
        {"subcategoria": ["subcategoria"]},
    )
    map_categoria_site = _build_lookup_by_code(
        categoria_site_rows,
        ["cod_produto", "product_code", "codigo", "sku"],
        {"categoria_site": ["categoria_site", "categoria"]},
    )
    map_vol = _build_lookup_by_code(
        volumetria_rows,
        ["cod_produto", "product_code", "codigo", "sku"],
        {
            "nm_fabricante": ["nm_fabricante", "fabricante", "marca"],
            "altura_cm": ["altura_cm", "altura"],
            "largura_cm": ["largura_cm", "largura"],
            "comprimento_cm": ["comprimento_cm", "comprimento"],
            "volume_cm3": ["volume_cm3", "volumetria_cm3", "volume"],
        },
    )
    map_fotos = _build_lookup_by_code(
        fotos_rows,
        ["product_code", "cod_produto", "codigo_produto", "sku"],
        {"photo_url": ["photo_url", "url_foto", "URL Foto", "foto", "imagem"]},
    )
    sales_by_code, sales_by_name = _extract_sales_maps_from_raw_values(vendas_raw_values)

    if (
        not map_degelo
        and not map_categoria_gpt
        and not map_subcat
        and not map_categoria_site
        and not map_vol
        and not map_fotos
        and not sales_by_code
        and not sales_by_name
    ):
        return base_produtos_map

    out: dict[str, dict[str, Any]] = {}
    for code, row in base_produtos_map.items():
        merged = dict(row)
        deg = map_degelo.get(code, {})
        gpt = map_categoria_gpt.get(code, {})
        sub = map_subcat.get(code, {})
        cat = map_categoria_site.get(code, {})
        vol = map_vol.get(code, {})
        foto = map_fotos.get(code, {})

        if normalize_string(merged.get("categoria_armazenagem")) == "":
            merged["categoria_armazenagem"] = (
                gpt.get("categoria_armazenagem")
                or deg.get("categoria_armazenagem")
                or merged.get("categoria_armazenagem")
            )
        if normalize_string(merged.get("subcategoria")) == "":
            merged["subcategoria"] = sub.get("subcategoria") or deg.get("subcategoria") or merged.get("subcategoria")
        if normalize_string(merged.get("categoria_site")) == "":
            merged["categoria_site"] = cat.get("categoria_site") or deg.get("categoria_site") or merged.get("categoria_site")
        if normalize_string(merged.get("nm_fabricante")) == "":
            merged["nm_fabricante"] = deg.get("nm_fabricante") or vol.get("nm_fabricante") or merged.get("nm_fabricante")
        if normalize_string(merged.get("altura_cm")) == "":
            merged["altura_cm"] = vol.get("altura_cm") or deg.get("altura_cm") or merged.get("altura_cm")
        if normalize_string(merged.get("peso_kg_unitario")) == "":
            merged["peso_kg_unitario"] = deg.get("peso_kg_unitario") or merged.get("peso_kg_unitario")
        if normalize_string(merged.get("curva")) == "":
            merged["curva"] = deg.get("curva") or merged.get("curva")
        if normalize_string(merged.get("venda_total")) == "":
            merged["venda_total"] = deg.get("venda_total") or merged.get("venda_total")
        if normalize_string(merged.get("venda_media_diaria")) == "":
            merged["venda_media_diaria"] = deg.get("venda_media_diaria") or merged.get("venda_media_diaria")
        if normalize_string(merged.get("dias_estoque")) == "":
            merged["dias_estoque"] = deg.get("dias_estoque") or merged.get("dias_estoque")
        if normalize_string(merged.get("is_fragil")) == "":
            merged["is_fragil"] = deg.get("is_fragil") or merged.get("is_fragil")
        if normalize_string(merged.get("degelo")) == "":
            merged["degelo"] = deg.get("degelo") or merged.get("degelo")
        if normalize_string(merged.get("prioridade_alocacao")) == "":
            merged["prioridade_alocacao"] = deg.get("prioridade_alocacao") or merged.get("prioridade_alocacao")
        if normalize_string(merged.get("photo_url")) == "":
            photo_url = normalize_string(foto.get("photo_url"))
            if photo_url and photo_url.lower() not in {"sem foto", "n/a", "na", "none", "null", "nan"}:
                merged["photo_url"] = photo_url

        if normalize_string(merged.get("vol_L_unitario")) == "" and normalize_string(merged.get("vol_l_unitario")) == "":
            deg_vol = parse_number(deg.get("vol_L_unitario") or deg.get("vol_l_unitario"))
            if deg_vol and deg_vol > 0:
                merged["vol_L_unitario"] = float(deg_vol)
                merged["vol_l_unitario"] = float(deg_vol)
            else:
                vol_cm3 = parse_number(vol.get("volume_cm3"))
                if vol_cm3 and vol_cm3 > 0:
                    vol_l = float(vol_cm3) / 1000.0
                    merged["vol_L_unitario"] = vol_l
                    merged["vol_l_unitario"] = vol_l

        categoria_site_norm = normalize_string(merged.get("categoria_site")).lower()
        if categoria_site_norm:
            merged["grupo"] = normalize_string(dic_cat_map.get(categoria_site_norm, merged.get("grupo") or "neutro")).lower()

        venda_total_num = parse_number(merged.get("venda_total"))
        if venda_total_num is None or venda_total_num <= 0:
            venda_lookup = sales_by_code.get(code)
            if venda_lookup is None:
                product_name = normalize_string(merged.get("product_name")).upper()
                venda_lookup = sales_by_name.get(product_name, 0.0)
            merged["venda_total"] = float(venda_lookup or 0.0)
        else:
            merged["venda_total"] = float(venda_total_num)

        venda_total_final = float(merged.get("venda_total") or 0.0)
        if venda_total_final > 0:
            venda_media_diaria = venda_total_final / 30.0
            quantidade_num = float(parse_number(merged.get("quantidade")) or 0.0)
            merged["venda_media_diaria"] = round(venda_media_diaria, 2)
            merged["dias_estoque"] = round((quantidade_num / venda_media_diaria), 2) if venda_media_diaria > 0 else 0.0
        else:
            merged["venda_media_diaria"] = 0.0
            merged["dias_estoque"] = 0.0

        altura_val = parse_number(merged.get("altura_cm")) or 0.0
        merged["is_alto"] = bool(limite_altura and altura_val >= limite_altura)
        merged["is_pequeno"] = bool(limite_altura_baixo and altura_val <= limite_altura_baixo)
        merged["is_pesado"] = parse_bool_flag(merged.get("is_pesado"))
        merged["is_fragil"] = normalize_string(merged.get("is_fragil")).upper()
        merged["degelo"] = normalize_string(merged.get("degelo")).upper()
        out[code] = merged

    positive_sales = [
        (code, float(parse_number(info.get("venda_total")) or 0.0))
        for code, info in out.items()
        if float(parse_number(info.get("venda_total")) or 0.0) > 0
    ]
    total_sales = sum(item[1] for item in positive_sales)
    curve_map: dict[str, str] = {}
    if total_sales > 0:
        running = 0.0
        for code, value in sorted(positive_sales, key=lambda item: item[1], reverse=True):
            running += value
            share = running / total_sales
            if share < 0.8:
                curve_map[code] = "A"
            elif share < 0.95:
                curve_map[code] = "B"
            else:
                curve_map[code] = "C"

    for code, info in out.items():
        venda_total_num = float(parse_number(info.get("venda_total")) or 0.0)
        if venda_total_num <= 0:
            info["curva"] = "D"
        else:
            info["curva"] = curve_map.get(code, "C")

    return out


def _enrich_base_map_with_plano_rows(
    base_produtos_map: dict[str, dict[str, Any]],
    plano_data: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    if not plano_data:
        return base_produtos_map

    keys_to_fill = [
        "product_name",
        "quantidade",
        "curva",
        "grupo",
        "grupo_alocado",
        "categoria_armazenagem",
        "subcategoria",
        "nm_fabricante",
        "venda_total",
        "altura_cm",
        "peso_kg_unitario",
        "vol_l_unitario",
        "vol_L_unitario",
        "is_pesado",
        "is_alto",
        "is_pequeno",
        "is_fragil",
        "degelo",
        "metodo",
        "photo_url",
    ]

    out = dict(base_produtos_map)
    for row in plano_data:
        code = normalize_string(row.get("product_code") or row.get("produto_alocado_code"))
        if not code or code == "Vazio":
            continue
        row_payload: dict[str, Any] = {
            "product_code": code,
            "product_name": row.get("product_name") or row.get("desc_produto") or "",
            "quantidade": row.get("quantidade"),
            "curva": row.get("curva"),
            "grupo": row.get("grupo") or row.get("grupo_alocado"),
            "grupo_alocado": row.get("grupo_alocado"),
            "categoria_armazenagem": row.get("categoria_armazenagem"),
            "subcategoria": row.get("subcategoria"),
            "nm_fabricante": row.get("nm_fabricante"),
            "venda_total": row.get("venda_total"),
            "altura_cm": row.get("altura_cm"),
            "peso_kg_unitario": row.get("peso_kg_unitario"),
            "vol_l_unitario": row.get("vol_l_unitario") or row.get("vol_L_unitario"),
            "vol_L_unitario": row.get("vol_L_unitario") or row.get("vol_l_unitario"),
            "is_pesado": row.get("is_pesado"),
            "is_alto": row.get("is_alto"),
            "is_pequeno": row.get("is_pequeno"),
            "is_fragil": row.get("is_fragil"),
            "degelo": row.get("degelo"),
            "metodo": row.get("metodo") or row.get("metodo_enderecamento"),
            "photo_url": row.get("photo_url"),
            "escaninhos_necessarios": 1,
        }

        if code not in out:
            continue

        target = out[code]
        for key in keys_to_fill:
            current = target.get(key)
            if normalize_string(current) != "":
                continue
            candidate = row_payload.get(key)
            if normalize_string(candidate) == "":
                continue
            target[key] = candidate
    return out


def _get_barcode_map(source: Any) -> dict[str, str]:
    try:
        if hasattr(source, "read_sheet"):
            data = source.read_sheet(SHEET_BARCODE)
        else:
            data = read_sheet(Path(source), SHEET_BARCODE)
    except Exception:
        return {}
    if not data:
        return {}

    barcode_map: dict[str, str] = {}
    for row in data:
        barcode = normalize_string(row.get("barcode"))
        cod_produto = normalize_string(row.get("cod_produto"))
        if (
            barcode
            and cod_produto
            and barcode != cod_produto
            and len(barcode) >= 8
            and barcode.isdigit()
            and barcode not in barcode_map
        ):
            barcode_map[barcode] = cod_produto
    return barcode_map


def _get_spreadsheet_title(source: Any) -> str:
    if hasattr(source, "spreadsheet_title"):
        title = source.spreadsheet_title()
        if title:
            return title
    try:
        path = Path(source)
        name = path.stem
        match = re.search(r"\[([^\]]+)\]", name)
        if match:
            return match.group(1).strip()
    except Exception:
        pass
    return "Dashboard Interativo da Loja"


def get_initial_data(source: Any) -> dict[str, Any]:
    base_data = load_sheet_safe(source, SHEET_BASE_PRODUTOS)
    plano_data = load_sheet_safe(source, SHEET_PLANO_FINAL)
    cadastro_data = load_sheet_safe(source, SHEET_CADASTRO)
    log_falhas_data = load_sheet_safe(source, SHEET_LOG_FALHAS)
    regras_ruas_data = load_sheet_safe(source, SHEET_REGRAS_RUAS)
    config_oper_data = load_sheet_safe(source, SHEET_CONFIG_OPER)
    volumetria_data = load_sheet_safe(source, SHEET_VOLUMETRIA)
    dic_cat_data = load_sheet_safe(source, SHEET_DIC_CATEGORIAS)

    dic_cat_map = build_dic_cat_map(dic_cat_data)
    limite_altura, limite_peso, limite_altura_baixo = load_limits(config_oper_data)
    base_produtos_map = build_base_produtos_map(base_data, dic_cat_map, limite_altura, limite_altura_baixo)
    base_produtos_map = _enrich_base_map_with_plano_rows(base_produtos_map, plano_data)
    base_produtos_map = _enrich_base_map_with_master_etl(
        source,
        base_produtos_map,
        dic_cat_map,
        limite_altura,
        limite_altura_baixo,
    )

    card175_context = get_card175_context(getattr(source, "sheet_id", None) if hasattr(source, "sheet_id") else None)
    display_plano_data = plano_data
    if card175_context:
        display_plano_data = _build_card175_mode_rows(plano_data, cadastro_data, volumetria_data)

    dashboard_data = _build_dashboard_data(display_plano_data, base_produtos_map)
    metrics = _compute_metrics(dashboard_data, base_produtos_map)

    content_html = _build_content_html(dashboard_data, base_produtos_map, metrics)

    failed_products_html, unallocated_products_list = _build_unallocated_section(
        base_produtos_map, base_data, plano_data, log_falhas_data, [], metrics
    )

    product_location_map, products_for_search = _build_products_for_search(dashboard_data)

    equip_types = sorted(
        {
            normalize_string(row.get("tipo_equipamento")).strip()
            for row in volumetria_data
            if normalize_string(row.get("tipo_equipamento")).strip()
            and normalize_string(row.get("tipo_equipamento")).lower() != "tipo_equipamento"
        }
    )

    spreadsheet_title = _get_spreadsheet_title(source)

    return {
        "content_html": content_html,
        "failed_products_section": failed_products_html,
        "all_products_json": _json_dumps(list(products_for_search.values())),
        "product_location_map_json": _json_dumps(product_location_map),
        "unallocated_products_json": _json_dumps(
            {
                normalize_string(p.get("instance_id") or p.get("id")): p
                for p in unallocated_products_list
                if normalize_string(p.get("instance_id") or p.get("id"))
            }
        ),
        "all_products_data_map_json": _json_dumps(base_produtos_map),
        "equipTypesJson": _json_dumps(equip_types),
        "metrics_panel_data_json": _json_dumps(metrics),
        "barcode_map_json": "{}",
        "spreadsheet_title": spreadsheet_title,
        "limite_peso_kg": limite_peso,
    }
