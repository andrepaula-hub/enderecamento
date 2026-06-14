"""Motor de pontuação e alocação do agente de endereçamento.

Contém dataclasses, helpers de normalização e o engine de scoring.
Importado por agent_tools.py — não importa nada de agent_tools para
evitar importação circular.
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

from .utils import normalize_string, parse_bool_flag, parse_number


COMPATIBILITY = {
    "seco": {"prateleira", "prateleira_lateral", "prateleira_alta"},
    "refrigerado": {"geladeira", "geladeira_alta", "geladeira_americana"},
    "congelado": {"freezer"},
}


@dataclass(frozen=True)
class AgentRules:
    allow_top_level: bool = False
    allow_second_slot: bool = False
    heavy_over_2kg_required_level: int = 4
    egg_min_level: int = 2
    egg_max_level: int = 4
    flv_blocked_prateleira_levels: tuple[int, ...] = (1, 5)
    require_multi_bin_same_level: bool = True
    second_slot_max_used_capacity_ratio: float = 0.55


@dataclass
class Slot:
    location_id: str
    equip_id: str
    street_num: int | None
    equip_num: int | None
    equip_type: str
    level: int | None
    position: int | None
    capacity_l: float | None
    is_top_level: bool
    is_bottom_level: bool
    occupant_count: int = 0
    occupant_codes: list[str] | None = None
    occupant_subcategories: set[str] | None = None
    occupant_volume_l: float = 0.0


# ── normalização ──────────────────────────────────────────────────────────────

def _normalize_text(value: Any) -> str:
    text = normalize_string(value).lower().strip()
    normalized = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _normalize_equip_type(value: Any) -> str:
    return _normalize_text(value).replace(" ", "_")


def _normalize_equip_id(value: Any) -> str:
    return normalize_string(value).upper().replace(" ", "")


def _product_code(row: dict[str, Any]) -> str:
    code = normalize_string(row.get("product_code") or row.get("produto_alocado_code") or row.get("codigo_sku"))
    return "" if not code or code == "Vazio" else code


def _group(row: dict[str, Any]) -> str:
    cached = row.get("_group_norm")
    if cached is not None:
        return str(cached)
    group = _normalize_text(row.get("grupo") or row.get("grupo_alocado"))
    if group == "quimicos":
        return "quimico"
    if group == "flvs":
        return "flv"
    return group


def _category_group(row: dict[str, Any]) -> str:
    cached = row.get("_category_group")
    if cached is not None:
        return str(cached)
    cat = _normalize_text(row.get("categoria_armazenagem") or row.get("cat_armz"))
    if any(token in cat for token in ("freezer", "congelado", "congelada")):
        return "congelado"
    if any(token in cat for token in ("geladeira", "refrigerado", "refrigerada")):
        return "refrigerado"
    return "seco"


def _required_bins(row: dict[str, Any]) -> int:
    value = parse_number(row.get("escaninhos_necessarios"))
    if value is None:
        esc = 1
    try:
        esc = max(1, int(math.ceil(float(value)))) if value is not None else 1
    except Exception:
        esc = 1
    if _category_group(row) == "refrigerado" and _normalize_text(row.get("degelo")).startswith("pode"):
        esc = min(esc, 4)
    return esc


def _required_volume_l(row: dict[str, Any]) -> float:
    cached = row.get("_required_volume_l")
    if cached is not None:
        try:
            return float(cached)
        except (TypeError, ValueError):
            pass
    quantity = parse_number(row.get("quantidade")) or 1
    unit = parse_number(row.get("vol_L_unitario") or row.get("vol_l_unitario")) or 0
    return max(0.0, float(quantity) * float(unit))


# ── construção de slots ───────────────────────────────────────────────────────

def _parse_int(value: Any) -> int | None:
    num = parse_number(value)
    if num is None:
        return None
    try:
        return int(num)
    except Exception:
        return None


def _slot_from_row(
    row: dict[str, Any],
    *,
    occupant_count: int = 0,
    occupied_rows: list[dict[str, Any]] | None = None,
    product_by_code: dict[str, dict[str, Any]] | None = None,
) -> Slot:
    rua = _parse_int(row.get("rua_num"))
    equip = _parse_int(row.get("equipamento_num"))
    equip_id = f"R{rua}-E{equip}" if rua is not None and equip is not None else ""
    level = _parse_int(row.get("nivel"))
    if level is None:
        esc = normalize_string(row.get("escaninho_nivel") or row.get("escaninho_num_no_nivel"))
        match = re.match(r"^(\d+)", esc)
        if match:
            level = _parse_int(match.group(1))
    occupied_codes: list[str] = []
    occupied_subcats: set[str] = set()
    occupied_volume = 0.0
    for occupied in occupied_rows or []:
        code = _product_code(occupied)
        if not code:
            continue
        occupied_codes.append(code)
        product = (product_by_code or {}).get(code, occupied)
        subcat = _normalize_text(product.get("subcategoria") or occupied.get("subcategoria"))
        if subcat:
            occupied_subcats.add(subcat)
        occupied_volume += _required_volume_l(product)
    return Slot(
        location_id=normalize_string(row.get("location_id")),
        equip_id=equip_id,
        street_num=rua,
        equip_num=equip,
        equip_type=_normalize_equip_type(row.get("tipo_equipamento_final") or row.get("tipo_equipamento")),
        level=level,
        position=_parse_int(row.get("escaninho_num_no_nivel")),
        capacity_l=parse_number(row.get("capacidade_l")),
        is_top_level=parse_bool_flag(row.get("is_nivel_alto")) or level == 1,
        is_bottom_level=parse_bool_flag(row.get("is_nivel_inferior")),
        occupant_count=occupant_count,
        occupant_codes=occupied_codes,
        occupant_subcategories=occupied_subcats,
        occupant_volume_l=occupied_volume,
    )


# ── regras duras ─────────────────────────────────────────────────────────────

def _is_prateleira(slot: Slot) -> bool:
    return "prateleira" in slot.equip_type


def _is_egg(product: dict[str, Any]) -> bool:
    name = _normalize_text(product.get("product_name"))
    first = name.split()[0] if name.split() else ""
    return first in {"ovo", "ovos"}


def _hard_rule_violations(
    product: dict[str, Any],
    slot: Slot,
    rules: AgentRules,
    chemical_equips: set[str],
    *,
    validate_chemical_zone: bool,
) -> list[str]:
    reasons: list[str] = []
    category = _category_group(product)
    compatible = COMPATIBILITY.get(category, set())
    if compatible and slot.equip_type not in compatible:
        reasons.append(f"Categoria {category} incompativel com equipamento {slot.equip_type}.")

    group = _group(product)
    if group == "quimico" and validate_chemical_zone and _normalize_equip_id(slot.equip_id) not in chemical_equips:
        reasons.append("Quimico fora da zona/equipamento isolado informado.")
    if validate_chemical_zone and _normalize_equip_id(slot.equip_id) in chemical_equips and group not in {"quimico", "perfumaria"}:
        reasons.append("Produto normal dentro da zona/equipamento de quimicos.")

    if not rules.allow_top_level and slot.is_top_level:
        reasons.append("Uso de nivel mais alto nao liberado.")

    if _is_egg(product) and slot.level is not None and (slot.level < rules.egg_min_level or slot.level > rules.egg_max_level):
        reasons.append("Ovos fora dos niveis intermediarios permitidos.")

    if _is_prateleira(slot):
        if group == "flv" and slot.level in set(rules.flv_blocked_prateleira_levels):
            reasons.append("FLV em nivel proibido de prateleira.")
        peso = parse_number(product.get("peso_kg_unitario")) or 0
        if peso > 2 and slot.level is not None and slot.level != rules.heavy_over_2kg_required_level:
            reasons.append(f"Produto >2kg fora do nivel {rules.heavy_over_2kg_required_level}.")
        if parse_bool_flag(product.get("is_pesado")) and slot.is_top_level:
            reasons.append("Produto pesado no nivel de topo.")

    if slot.occupant_count >= 2:
        reasons.append("Endereco ja tem 2 produtos.")
    if slot.occupant_count == 1 and not rules.allow_second_slot:
        reasons.append("Segundo produto por endereco nao liberado.")
    if slot.occupant_count == 1:
        subcat = str(product.get("_subcategoria_norm") or _normalize_text(product.get("subcategoria")))
        if subcat and subcat in (slot.occupant_subcategories or set()):
            reasons.append("Subcategoria repetida no mesmo endereco.")
        if slot.capacity_l and slot.capacity_l > 0:
            projected = slot.occupant_volume_l + _required_volume_l(product)
            if projected / slot.capacity_l > rules.second_slot_max_used_capacity_ratio:
                reasons.append("Slot duplo acima do limite de baixa volumetria.")

    return reasons


# ── engine de pontuação ───────────────────────────────────────────────────────

def _sort_products_for_allocation(products: list[dict[str, Any]]) -> list[dict[str, Any]]:
    curve_order = {"A": 0, "B": 1, "C": 2}

    def key(row: dict[str, Any]) -> tuple[int, int, str]:
        group_rank = 0 if _group(row) == "quimico" else 1
        curve = normalize_string(row.get("curva")).upper()[:1]
        return (group_rank, curve_order.get(curve, 9), normalize_string(row.get("product_name")))

    return sorted(products, key=key)


def _pick_slots_for_product(
    product: dict[str, Any],
    required: int,
    slots: list[Slot],
    rules: AgentRules,
    chemical_equips: set[str],
    reserved_locations: set[str],
    placement_index: dict[tuple[str, str], list[dict[str, Any]]],
    curve_zone_map: dict[str, set[int]],
) -> list[Slot]:
    required = max(1, int(required or 1))
    candidates: list[Slot] = []
    compatible_equips = COMPATIBILITY.get(_category_group(product), set())
    for slot in slots:
        if compatible_equips and slot.equip_type not in compatible_equips:
            continue
        if slot.location_id in reserved_locations and slot.occupant_count == 0:
            continue
        reasons = _hard_rule_violations(product, slot, rules, chemical_equips, validate_chemical_zone=bool(chemical_equips))
        if reasons:
            continue
        candidates.append(slot)

    if not candidates:
        return []

    if required == 1:
        return [max(candidates, key=lambda slot: _score_slot(product, slot, placement_index, curve_zone_map))]

    grouped_runs = _candidate_runs(product, candidates, required, rules)
    if not grouped_runs:
        return []
    return max(grouped_runs, key=lambda run: _score_run(product, run, placement_index, curve_zone_map))


def _candidate_runs(product: dict[str, Any], candidates: list[Slot], required: int, rules: AgentRules) -> list[list[Slot]]:
    empty_candidates = [slot for slot in candidates if slot.occupant_count == 0]
    runs: list[list[Slot]] = []
    by_level: dict[tuple[str, int | None], list[Slot]] = {}
    for slot in empty_candidates:
        by_level.setdefault((slot.equip_id, slot.level), []).append(slot)

    for (_, _), slots_same_level in by_level.items():
        ordered = sorted(slots_same_level, key=lambda slot: slot.position if slot.position is not None else 999)
        for idx in range(0, max(0, len(ordered) - required + 1)):
            candidate = ordered[idx : idx + required]
            positions = [slot.position for slot in candidate]
            if all(pos is not None for pos in positions):
                sorted_positions = sorted(int(pos) for pos in positions if pos is not None)
                if sorted_positions != list(range(sorted_positions[0], sorted_positions[0] + required)):
                    continue
            runs.append(candidate)

    if runs or rules.require_multi_bin_same_level:
        return runs

    ordered_all = sorted(empty_candidates, key=lambda slot: (-_score_slot(product, slot, {}, {}), slot.equip_id, slot.level or 999, slot.position or 999))
    return [ordered_all[:required]] if len(ordered_all) >= required else []


def _score_run(product: dict[str, Any], run: list[Slot], placement_index: dict[tuple[str, str], list[dict[str, Any]]], curve_zone_map: dict[str, set[int]]) -> float:
    if not run:
        return -1_000_000
    score = sum(_score_slot(product, slot, placement_index, curve_zone_map) for slot in run)
    levels = {slot.level for slot in run}
    equips = {slot.equip_id for slot in run}
    if len(levels) == 1:
        score += 500
    if len(equips) == 1:
        score += 300
    positions = sorted(slot.position for slot in run if slot.position is not None)
    if len(positions) == len(run) and positions == list(range(positions[0], positions[0] + len(run))):
        score += 400
    return score


def _score_slot(product: dict[str, Any], slot: Slot, placement_index: dict[tuple[str, str], list[dict[str, Any]]], curve_zone_map: dict[str, set[int]]) -> float:
    score = 0.0
    group = _group(product)
    curve = normalize_string(product.get("curva")).upper()[:1]
    if group == "quimico":
        score += 500
    if curve == "A" and not slot.is_top_level:
        score += 40
    if curve == "C" and slot.is_top_level:
        score += 20
    if _is_prateleira(slot) and parse_bool_flag(product.get("is_pesado")) and slot.level in {3, 4}:
        score += 70
    if slot.occupant_count == 0:
        score += 30
    else:
        score -= 80
    if slot.level is not None:
        score -= abs(slot.level - 3) * 2
    score += _curve_zone_score(curve, slot, curve_zone_map)
    score -= _adjacency_penalty(product, slot, placement_index)
    return score


def _adjacency_penalty(product: dict[str, Any], slot: Slot, placement_index: dict[tuple[str, str], list[dict[str, Any]]]) -> float:
    subcat = str(product.get("_subcategoria_norm") or _normalize_text(product.get("subcategoria")))
    if not subcat:
        return 0.0
    penalty = 0.0
    for placement in placement_index.get((subcat, slot.equip_id), []):
        other_level = placement.get("level")
        other_pos = placement.get("position")
        if other_level is None or other_pos is None or slot.level is None or slot.position is None:
            continue
        if other_level == slot.level and abs(int(other_pos) - int(slot.position)) == 1:
            penalty += 700
        elif other_level == slot.level:
            distance = abs(int(other_pos) - int(slot.position))
            if distance <= 3:
                penalty += 180 / max(distance, 1)
            else:
                penalty += 15
        elif other_pos == slot.position and abs(int(other_level) - int(slot.level)) == 1:
            penalty += 80
        elif abs(int(other_level) - int(slot.level)) == 1:
            penalty += 25
    return penalty


def _normalize_curve_zones(curve_zones: dict[str, Any] | None) -> dict[str, set[int]]:
    output: dict[str, set[int]] = {}
    if not isinstance(curve_zones, dict):
        return output
    for raw_curve, raw_value in curve_zones.items():
        curve = normalize_string(raw_curve).upper()[:1]
        if not curve:
            continue
        ruas: list[Any]
        if isinstance(raw_value, dict):
            ruas = _as_list(raw_value.get("ruas") or raw_value.get("streets") or raw_value.get("street_nums"))
        else:
            ruas = _as_list(raw_value)
        parsed = {_parse_int(item) for item in ruas}
        output[curve] = {int(item) for item in parsed if item is not None}
    return output


def _curve_zone_score(curve: str, slot: Slot, curve_zone_map: dict[str, set[int]]) -> float:
    if not curve or not curve_zone_map or slot.street_num is None:
        return 0.0
    preferred = curve_zone_map.get(curve)
    if preferred:
        return 260.0 if slot.street_num in preferred else -90.0
    any_match = any(slot.street_num in streets for streets in curve_zone_map.values())
    return -30.0 if any_match else 0.0


# ── índice de placements ──────────────────────────────────────────────────────

def _build_existing_placements(plan_rows: list[dict[str, Any]], base_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    product_by_code = {_product_code(row): row for row in base_rows if _product_code(row)}
    placements: list[dict[str, Any]] = []
    for row in plan_rows:
        code = _product_code(row)
        if not code:
            continue
        product = product_by_code.get(code, row)
        placements.append(_placement_for_slot(product, _slot_from_row(row)))
    return placements


def _build_placement_index(placements: list[dict[str, Any]]) -> dict[tuple[str, str], list[dict[str, Any]]]:
    index: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for placement in placements:
        _add_placement_to_index(index, placement)
    return index


def _add_placement_to_index(index: dict[tuple[str, str], list[dict[str, Any]]], placement: dict[str, Any]) -> None:
    subcat = _normalize_text(placement.get("subcategoria"))
    equip_id = normalize_string(placement.get("equip_id"))
    if not subcat or not equip_id:
        return
    index.setdefault((subcat, equip_id), []).append(placement)


def _placement_for_slot(product: dict[str, Any], slot: Slot) -> dict[str, Any]:
    return {
        "product_code": _product_code(product),
        "subcategoria": _normalize_text(product.get("subcategoria")),
        "equip_id": slot.equip_id,
        "level": slot.level,
        "position": slot.position,
        "street_num": slot.street_num,
    }


def _commit_product_to_slot(slot: Slot, product: dict[str, Any]) -> None:
    slot.occupant_count += 1
    slot.occupant_codes = (slot.occupant_codes or []) + [normalize_string(product.get("product_code"))]
    subcat = str(product.get("_subcategoria_norm") or _normalize_text(product.get("subcategoria")))
    if subcat:
        slot.occupant_subcategories = set(slot.occupant_subcategories or set())
        slot.occupant_subcategories.add(subcat)
    slot.occupant_volume_l += _required_volume_l(product)


# ── utilitários ───────────────────────────────────────────────────────────────

def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]
