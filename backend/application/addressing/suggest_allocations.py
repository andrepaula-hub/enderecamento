"""Sugestão de alocação inteligente com regras FLV/pesado/quimico."""
from __future__ import annotations

import re
from collections import Counter
from typing import Any

from core.agent_scoring import (
    AgentRules,
    Slot,
    _add_placement_to_index,
    _actionable_subcategory,
    _build_placement_index,
    _commit_product_to_slot,
    _group,
    _degelo_class,
    _equipment_concentration_penalty,
    _hard_rule_violations,
    _is_cold_high_product,
    _normalize_curve_zones,
    _normalize_equip_id,
    _normalize_equip_type,
    _normalize_text,
    _pick_slots_for_product,
    _placement_for_slot,
    _required_volume_l,
    _score_run,
    _sort_products_for_allocation,
    _visual_family,
)
from core.utils import normalize_string, parse_bool_flag

BLOCKED_SLOT_CODE = "__BLOCKED__"
BOARD_ENTRY_RE = re.compile(r"^(?:unallocated|collected)::(.+?)::\d+$")


def _entry_product_code(value: Any) -> str:
    """Converte ids da prancheta em código real de produto."""
    text = normalize_string(value)
    match = BOARD_ENTRY_RE.match(text)
    return match.group(1) if match else text


def suggest_allocations(
    unallocated_codes: list[str],
    products_data: list[dict[str, Any]],
    map_structure: list[dict[str, Any]],
    allocations: dict[str, dict[str, str | None]],
    options: dict[str, Any],
) -> dict[str, Any]:
    """Roda o engine de scoring sobre o estado atual do React e devolve moves sugeridos.

    Parâmetros vindos do frontend:
        unallocated_codes: códigos dos produtos ainda não alocados
        products_data:     lista de produtos no formato do React Product
        map_structure:     Street[] do React (id, equipment[])
        allocations:       {escaninhoId: {p1, p2}} estado atual
        options:           {allow_top_level, allow_second_slot, chemical_equipment_ids, curve_zones}
    """
    allow_top_level = bool(options.get("allow_top_level", False))
    allow_second_slot = bool(options.get("allow_second_slot", False))
    allow_clicked_top_level = bool(options.get("allow_clicked_top_level", False))
    chemical_equips = {
        _normalize_equip_id(eid)
        for eid in (options.get("chemical_equipment_ids") or [])
        if str(eid or "").strip()
    }
    degelo_preferred_equips = {
        _normalize_equip_id(eid)
        for eid in (options.get("degelo_preferred_equipment_ids") or [])
        if str(eid or "").strip()
    }
    curve_zones = _normalize_curve_zones(options.get("curve_zones"))
    curve_priority_enabled = bool(options.get("curve_priority_enabled") or options.get("whole_street"))
    rules = AgentRules(
        allow_top_level=allow_top_level,
        allow_second_slot=allow_second_slot,
        allow_clicked_top_level=allow_clicked_top_level,
    )

    # Map React Product → scoring dict
    products_by_code: dict[str, dict[str, Any]] = {}
    for p in products_data:
        code = str(p.get("id") or p.get("product_code") or "").strip()
        if not code:
            continue
        products_by_code[code] = _react_product_to_scoring(p)

    normalized_unallocated_codes = [_entry_product_code(code) for code in unallocated_codes]
    requested_counts = Counter(code for code in normalized_unallocated_codes if code in products_by_code)
    allocated_counts = Counter(
        _entry_product_code(code)
        for alloc in allocations.values()
        if isinstance(alloc, dict)
        for code in (alloc.get("p1"), alloc.get("p2"))
        if code and _entry_product_code(code) != BLOCKED_SLOT_CODE
    )
    products_to_allocate = []
    for code in normalized_unallocated_codes:
        if code not in requested_counts:
            continue
        product = dict(products_by_code[code])
        required_from_product = max(1, int(product.get("escaninhos_necessarios") or 1))
        product["_required_volume_l"] = _required_volume_l(product)
        product["_total_required_bins"] = required_from_product
        remaining_required = max(0, required_from_product - allocated_counts.get(code, 0))
        requested = remaining_required
        if requested <= 0:
            del requested_counts[code]
            continue
        product["escaninhos_necessarios"] = requested
        products_to_allocate.append(product)
        del requested_counts[code]
    allocation_pool_size = len(products_to_allocate)
    for product in products_to_allocate:
        product["_allocation_pool_size"] = allocation_pool_size

    # Build slots from map_structure + current allocations
    slots = _slots_from_map(map_structure, allocations, allow_second_slot, products_by_code)

    # Build placement index from already-allocated products (for adjacency penalty)
    existing_placements: list[dict[str, Any]] = []
    for loc_id, alloc in allocations.items():
        for field in ("p1", "p2"):
            raw_code = alloc.get(field) if isinstance(alloc, dict) else None
            code = _entry_product_code(raw_code)
            if not code:
                continue
            product = products_by_code.get(code)
            if not product:
                continue
            slot_ref = _slot_from_location_id(loc_id, map_structure, allocations, allow_second_slot)
            if slot_ref:
                existing_placements.append(_placement_for_slot(product, slot_ref))

    placement_index = _build_placement_index(existing_placements)
    product_placement_index: dict[str, list[dict[str, Any]]] = {}
    for placement in existing_placements:
        code = str(placement.get("product_code") or "")
        if not code:
            continue
        product_placement_index.setdefault(code, []).append(placement)
    slots_by_location = {s.location_id: s for s in slots}
    reserved_locations: set[str] = set()

    proposed: list[dict[str, Any]] = []
    unallocated_out: list[str] = []
    max_proposals = _available_slot_units(slots, allow_second_slot)

    sorted_products = _sort_products_for_allocation(products_to_allocate, curve_priority_enabled=curve_priority_enabled)
    pending_cold_high_units = sum(
        max(1, int(product.get("escaninhos_necessarios") or 1))
        for product in sorted_products
        if _is_cold_high_product(product)
    )
    pending_degelo_units = Counter(
        _degelo_class(product)
        for product in sorted_products
        for _ in range(max(1, int(product.get("escaninhos_necessarios") or 1)))
        if _degelo_class(product) in {"nao", "pode"}
    )

    candidate_window = _allocation_candidate_window(options)
    remaining_products = list(sorted_products)
    product_order = {id(product): index for index, product in enumerate(remaining_products)}
    deferral_counts: dict[int, int] = {}
    while remaining_products and len(proposed) < max_proposals:
        best_option: tuple[float, int, dict[str, Any], list[Slot], str, int, bool, str] | None = None
        evaluated_products: list[dict[str, Any]] = []
        candidate_products = _allocation_candidate_products(remaining_products, candidate_window)
        for pool_index, product_pool in enumerate((candidate_products, remaining_products)):
            if pool_index == 1 and len(candidate_products) == len(remaining_products):
                break
            for product in product_pool:
                evaluated_products.append(product)
                code = str(product.get("product_code") or "")
                required = max(1, int(product.get("escaninhos_necessarios") or 1))
                product_is_cold_high = _is_cold_high_product(product)
                high_units_remaining_after_current = pending_cold_high_units
                if product_is_cold_high:
                    high_units_remaining_after_current = max(0, pending_cold_high_units - required)
                degelo_class = _degelo_class(product)
                opposite_degelo_units_remaining = 0
                if degelo_class == "nao":
                    opposite_degelo_units_remaining = pending_degelo_units.get("pode", 0)
                elif degelo_class == "pode":
                    opposite_degelo_units_remaining = pending_degelo_units.get("nao", 0)

                candidates = _pick_slots_for_product(
                    product, required, slots, rules, chemical_equips,
                    reserved_locations, placement_index, product_placement_index, curve_zones,
                    degelo_preferred_equips, curve_priority_enabled, high_units_remaining_after_current,
                    opposite_degelo_units_remaining,
                )
                if len(candidates) != required:
                    continue

                blocked = []
                for candidate in candidates:
                    blocked.extend(
                        _hard_rule_violations(product, candidate, rules, chemical_equips, validate_chemical_zone=bool(chemical_equips))
                    )
                if blocked:
                    continue

                candidate_score = _score_run(
                    product,
                    candidates,
                    placement_index,
                    curve_zones,
                    degelo_preferred_equips,
                    curve_priority_enabled,
                )
                if _equipment_concentration_penalty(product, candidates[0], placement_index) > 0:
                    candidate_score += min(900.0, float(deferral_counts.get(id(product), 0)) * 180.0)
                option = (
                    candidate_score,
                    -product_order.get(id(product), 0),
                    product,
                    candidates,
                    code,
                    required,
                    product_is_cold_high,
                    degelo_class,
                )
                if best_option is None or option[:2] > best_option[:2]:
                    best_option = option
            if best_option is not None:
                break

        if best_option is None:
            unallocated_out.extend(str(product.get("product_code") or "") for product in remaining_products)
            remaining_products = []
            break

        _, _, product, candidates, code, required, product_is_cold_high, degelo_class = best_option
        remaining_products.remove(product)
        chosen_id = id(product)
        deferral_counts.pop(chosen_id, None)
        for evaluated_product in evaluated_products:
            evaluated_id = id(evaluated_product)
            if evaluated_id != chosen_id and evaluated_product in remaining_products:
                deferral_counts[evaluated_id] = deferral_counts.get(evaluated_id, 0) + 1

        if product_is_cold_high:
            pending_cold_high_units = max(0, pending_cold_high_units - required)
        if degelo_class in pending_degelo_units:
            pending_degelo_units[degelo_class] = max(0, pending_degelo_units[degelo_class] - required)

        for unit_idx, candidate in enumerate(candidates, start=1):
            target_slot = 2 if candidate.occupant_count == 1 else 1
            proposed.append({"escaninhoId": candidate.location_id, "productCode": code, "slot": target_slot})
            reserved_locations.add(candidate.location_id)
            slot_ref = slots_by_location.get(candidate.location_id)
            if slot_ref:
                _commit_product_to_slot(slot_ref, product)
                placement = _placement_for_slot(product, slot_ref)
                _add_placement_to_index(placement_index, placement)
                product_placement_index.setdefault(code, []).append(placement)

    if remaining_products:
        unallocated_out.extend(str(product.get("product_code") or "") for product in remaining_products)

    proposed, validation_unallocated = _drop_invalid_plan_moves(
        proposed=proposed,
        products_to_allocate=products_to_allocate,
        allocations=allocations,
        map_structure=map_structure,
        products_by_code=products_by_code,
    )
    unallocated_out.extend(code for code in validation_unallocated if code not in unallocated_out)

    return {
        "success": True,
        "moves": proposed,
        "unallocated": unallocated_out,
        "summary": {
            "total_requested": sum(int(product.get("escaninhos_necessarios") or 1) for product in products_to_allocate),
            "proposed": len(proposed),
            "unallocated": len(unallocated_out),
        },
    }


# ── helpers ────────────────────────────────────────────────────────────────────

def _allocation_candidate_window(options: dict[str, Any]) -> int:
    raw_value = options.get("candidate_window")
    if raw_value in (None, ""):
        return 6
    try:
        return max(1, int(raw_value))
    except (TypeError, ValueError):
        return 6


def _allocation_candidate_products(products: list[dict[str, Any]], candidate_window: int) -> list[dict[str, Any]]:
    if len(products) <= candidate_window:
        return products

    selected: list[dict[str, Any]] = []
    seen: set[int] = set()

    def add(product: dict[str, Any]) -> None:
        marker = id(product)
        if marker in seen:
            return
        seen.add(marker)
        selected.append(product)

    for product in products[:candidate_window]:
        add(product)

    sample_count = min(2, max(0, len(products) - candidate_window))
    if sample_count:
        tail_count = len(products) - candidate_window
        for index in range(sample_count):
            offset = candidate_window + (index * tail_count // sample_count)
            add(products[offset])

    return selected


def _available_slot_units(slots: list[Slot], allow_second_slot: bool) -> int:
    total = 0
    for slot in slots:
        if slot.occupant_count <= 0:
            total += 1
        elif allow_second_slot and slot.occupant_count == 1:
            total += 1
    return total


def _drop_invalid_plan_moves(
    *,
    proposed: list[dict[str, Any]],
    products_to_allocate: list[dict[str, Any]],
    allocations: dict[str, dict[str, str | None]],
    map_structure: list[dict[str, Any]],
    products_by_code: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[str]]:
    invalid_codes: set[str] = set()
    product_by_code = {str(product.get("product_code") or ""): product for product in products_to_allocate}

    final_slots_by_code: dict[str, list[str]] = {}
    for slot_id, alloc in (allocations or {}).items():
        if not isinstance(alloc, dict):
            continue
        for raw_code in (alloc.get("p1"), alloc.get("p2")):
            code = _entry_product_code(raw_code)
            if code and code != BLOCKED_SLOT_CODE:
                final_slots_by_code.setdefault(code, []).append(str(slot_id))
    for move in proposed:
        code = _entry_product_code(move.get("productCode"))
        slot_id = str(move.get("escaninhoId") or "")
        if code and slot_id:
            final_slots_by_code.setdefault(code, []).append(slot_id)

    for code, product in product_by_code.items():
        if code not in final_slots_by_code:
            continue
        required = max(1, int(product.get("_total_required_bins") or product.get("escaninhos_necessarios") or 1))
        if required <= 1:
            continue
        slot_ids = final_slots_by_code.get(code, [])
        if len(slot_ids) != required or not _slot_ids_are_contiguous_block(slot_ids, map_structure):
            invalid_codes.add(code)

    proposed_codes = {_entry_product_code(move.get("productCode")) for move in proposed}
    final_occupants: list[dict[str, Any]] = []
    for slot_id, alloc in (allocations or {}).items():
        if not isinstance(alloc, dict):
            continue
        parsed = _parse_front_location_id(slot_id)
        if not parsed:
            continue
        for raw_code in (alloc.get("p1"), alloc.get("p2")):
            code = _entry_product_code(raw_code)
            if code and code != BLOCKED_SLOT_CODE:
                final_occupants.append({**parsed, "code": code, "proposed": False})
    for move in proposed:
        code = _entry_product_code(move.get("productCode"))
        parsed = _parse_front_location_id(move.get("escaninhoId"))
        if code and parsed:
            final_occupants.append({**parsed, "code": code, "proposed": True})
    for idx, left in enumerate(final_occupants):
        left_product = products_by_code.get(left["code"])
        left_subcat = _actionable_subcategory(left_product) if left_product else ""
        if not left_subcat:
            continue
        for right in final_occupants[idx + 1:]:
            if left["code"] == right["code"]:
                continue
            if left["equip_id"] != right["equip_id"] or left["level"] != right["level"]:
                continue
            right_product = products_by_code.get(right["code"])
            right_subcat = _actionable_subcategory(right_product) if right_product else ""
            if left_subcat and left_subcat == right_subcat:
                if left["proposed"] and left["code"] in proposed_codes:
                    invalid_codes.add(left["code"])
                if right["proposed"] and right["code"] in proposed_codes:
                    invalid_codes.add(right["code"])

    mixed_degelo_equips: set[str] = set()
    degelo_by_equip: dict[str, set[str]] = {}
    for code, slot_ids in final_slots_by_code.items():
        product = products_by_code.get(code)
        if not product:
            continue
        degelo = _degelo_class(product)
        if degelo not in {"nao", "pode"}:
            continue
        for slot_id in slot_ids:
            equip_id = _equipment_id_from_location_id(slot_id)
            if equip_id:
                degelo_by_equip.setdefault(equip_id, set()).add(degelo)
    for equip_id, classes in degelo_by_equip.items():
        if {"nao", "pode"}.issubset(classes):
            mixed_degelo_equips.add(equip_id)
    if len(mixed_degelo_equips) > 1:
        for move in proposed:
            if _equipment_id_from_location_id(move.get("escaninhoId")) in mixed_degelo_equips:
                invalid_codes.add(_entry_product_code(move.get("productCode")))

    equip_type_by_id = {
        str(equip.get("id") or ""): str(equip.get("tipo") or "")
        for street in (map_structure or [])
        for equip in (street.get("equipment", []) or [])
    }
    for move in proposed:
        code = _entry_product_code(move.get("productCode"))
        product = products_by_code.get(code)
        equip_id = _equipment_id_from_location_id(move.get("escaninhoId"))
        if product and _is_cold_high_product(product) and _normalize_equip_type(equip_type_by_id.get(equip_id)) != "geladeira_alta":
            invalid_codes.add(code)

    if not invalid_codes:
        return proposed, []
    filtered = [move for move in proposed if _entry_product_code(move.get("productCode")) not in invalid_codes]
    return filtered, sorted(code for code in invalid_codes if code)


def _slot_ids_are_contiguous_block(slot_ids: list[str], map_structure: list[dict[str, Any]]) -> bool:
    parsed = [_parse_front_location_id(slot_id) for slot_id in slot_ids]
    if not parsed or any(item is None for item in parsed):
        return False
    parsed_items = [item for item in parsed if item is not None]
    equip_ids = {item["equip_id"] for item in parsed_items}
    if len(equip_ids) != 1:
        return False
    equip_id = next(iter(equip_ids))
    by_level: dict[int, list[int]] = {}
    for item in parsed_items:
        by_level.setdefault(int(item["level"]), []).append(int(item["position"]))
    levels = sorted(by_level)

    def contiguous(positions: list[int]) -> bool:
        ordered = sorted(positions)
        return bool(ordered) and ordered == list(range(ordered[0], ordered[0] + len(ordered)))

    if len(levels) == 1:
        return contiguous(by_level[levels[0]])
    if len(levels) != 2 or levels[1] != levels[0] + 1:
        return False
    if not all(contiguous(by_level[level]) for level in levels):
        return False
    first = sorted(by_level[levels[0]])
    second = sorted(by_level[levels[1]])
    larger = first if len(first) >= len(second) else second
    smaller = second if larger is first else first
    larger_set = set(larger)
    smaller_set = set(smaller)
    if len(larger) <= len(smaller):
        return False
    return bool(smaller) and smaller_set.issubset(larger_set) and (smaller[0] == larger[0] or smaller[-1] == larger[-1])


def _parse_front_location_id(location_id: Any) -> dict[str, Any] | None:
    parts = str(location_id or "").split("-")
    if len(parts) < 4:
        return None
    try:
        position = int(parts[-1])
        level = int(parts[-2])
    except ValueError:
        return None
    return {"equip_id": "-".join(parts[:-2]), "level": level, "position": position}


def _equipment_id_from_location_id(location_id: Any) -> str:
    parsed = _parse_front_location_id(location_id)
    return str(parsed.get("equip_id") or "") if parsed else ""


def _react_product_to_scoring(p: dict[str, Any]) -> dict[str, Any]:
    return {
        "product_code": str(p.get("id") or p.get("product_code") or ""),
        "product_name": str(p.get("nome") or p.get("product_name") or ""),
        "grupo": str(p.get("grupo") or ""),
        "curva": str(p.get("curva") or ""),
        "subcategoria": str(p.get("sub") or p.get("subcategoria") or ""),
        "subcategoria_nivel_2": str(
            p.get("subNivel2")
            or p.get("subcategoria_nivel_2")
            or p.get("subcategoria_nivel2")
            or ""
        ),
        "familia_visual": str(p.get("familia_visual") or p.get("familia") or ""),
        "nm_fabricante": str(p.get("fabricante") or p.get("nm_fabricante") or ""),
        "peso_kg_unitario": float(p.get("peso") or p.get("peso_kg") or 0),
        "vol_L_unitario": float(p.get("vol") or p.get("vol_L_unitario") or 0),
        "quantidade": int(p.get("qtd") or p.get("quantidade") or 1),
        "escaninhos_necessarios": int(p.get("escsNec") or p.get("escaninhos_necessarios") or 1),
        "is_pesado": parse_bool_flag(p.get("pesado") if "pesado" in p else p.get("is_pesado")),
        "is_alto": parse_bool_flag(p.get("alto") if "alto" in p else p.get("is_alto")),
        "is_altinho": parse_bool_flag(p.get("altinho") if "altinho" in p else p.get("is_altinho")),
        "is_pequeno": parse_bool_flag(p.get("pequeno") if "pequeno" in p else p.get("is_pequeno")),
        "is_fragil": parse_bool_flag(p.get("fragil") if "fragil" in p else p.get("is_fragil")),
        "categoria_armazenagem": str(p.get("arm") or p.get("categoria_armazenagem") or ""),
        "degelo": str(p.get("degelo") or ""),
    }


def _slots_from_map(
    map_structure: list[dict[str, Any]],
    allocations: dict[str, dict[str, str | None]],
    allow_second_slot: bool,
    products_by_code: dict[str, dict[str, Any]],
) -> list[Slot]:
    slots: list[Slot] = []
    for street in map_structure:
        for equip in street.get("equipment", []):
            equip_id = str(equip.get("id") or "")
            tipo = str(equip.get("tipo") or "prateleira")
            niveis = int(equip.get("niveis") or 5)
            escs_per_nivel = int(equip.get("escsPerNivel") or 7)
            cap = float(equip.get("cap") or 0)

            parts = equip_id.split("-")
            try:
                rua_num = int(parts[0].replace("R", "")) if parts else None
            except (ValueError, IndexError):
                rua_num = None
            try:
                equip_num = int(parts[1].replace("E", "")) if len(parts) > 1 else None
            except (ValueError, IndexError):
                equip_num = None

            for nivel in range(1, niveis + 1):
                for pos in range(1, escs_per_nivel + 1):
                    loc_id = f"{equip_id}-{nivel}-{pos}"
                    alloc = allocations.get(loc_id) or {}
                    p1 = alloc.get("p1") if isinstance(alloc, dict) else None
                    p2 = alloc.get("p2") if isinstance(alloc, dict) else None
                    real_codes = [
                        _entry_product_code(code)
                        for code in (p1, p2)
                        if code and _entry_product_code(code) != BLOCKED_SLOT_CODE
                    ]
                    occupant_count = 2 if BLOCKED_SLOT_CODE in {p1, p2} else len(real_codes)
                    occupant_subcategories = {
                        _normalize_text(products_by_code[code].get("subcategoria"))
                        for code in real_codes
                        if code in products_by_code and _normalize_text(products_by_code[code].get("subcategoria"))
                    }
                    occupant_families = {
                        _visual_family(products_by_code[code])
                        for code in real_codes
                        if code in products_by_code and _visual_family(products_by_code[code])
                    }
                    occupant_manufacturers = {
                        _normalize_text(products_by_code[code].get("nm_fabricante"))
                        for code in real_codes
                        if code in products_by_code and _normalize_text(products_by_code[code].get("nm_fabricante"))
                    }
                    occupant_volume_l = sum(
                        _required_volume_l(products_by_code[code])
                        for code in real_codes
                        if code in products_by_code
                    )
                    slots.append(Slot(
                        location_id=loc_id,
                        equip_id=equip_id,
                        street_num=rua_num,
                        equip_num=equip_num,
                        equip_type=tipo,
                        level=nivel,
                        position=pos,
                        capacity_l=cap,
                        is_top_level=(nivel == 1),
                        is_bottom_level=(nivel == niveis),
                        max_level=niveis,
                        max_position=escs_per_nivel,
                        occupant_count=occupant_count,
                        occupant_codes=real_codes,
                        occupant_subcategories=occupant_subcategories,
                        occupant_families=occupant_families,
                        occupant_manufacturers=occupant_manufacturers,
                        occupant_volume_l=occupant_volume_l,
                    ))
    return slots


def _slot_from_location_id(
    loc_id: str,
    map_structure: list[dict[str, Any]],
    allocations: dict[str, dict[str, str | None]],
    allow_second_slot: bool,
) -> Slot | None:
    """Monta um Slot a partir do location_id, buscando o equipment no map_structure."""
    parts = loc_id.split("-")
    if len(parts) < 4:
        return None
    equip_id = "-".join(parts[:2])
    try:
        nivel = int(parts[2])
        pos = int(parts[3])
    except (ValueError, IndexError):
        return None

    for street in map_structure:
        for equip in street.get("equipment", []):
            if str(equip.get("id") or "") == equip_id:
                niveis = int(equip.get("niveis") or 5)
                escs_per_nivel = int(equip.get("escsPerNivel") or 5)
                cap = float(equip.get("cap") or 0)
                tipo = str(equip.get("tipo") or "prateleira")
                e_parts = equip_id.split("-")
                try:
                    rua_num = int(e_parts[0].replace("R", ""))
                except (ValueError, IndexError):
                    rua_num = None
                try:
                    equip_num = int(e_parts[1].replace("E", ""))
                except (ValueError, IndexError):
                    equip_num = None
                alloc = allocations.get(loc_id) or {}
                p1 = alloc.get("p1") if isinstance(alloc, dict) else None
                p2 = alloc.get("p2") if isinstance(alloc, dict) else None
                normalized_p1 = _entry_product_code(p1)
                normalized_p2 = _entry_product_code(p2)
                occupant_count = (
                    2
                    if BLOCKED_SLOT_CODE in {normalized_p1, normalized_p2}
                    else (1 if normalized_p1 else 0) + (1 if normalized_p2 else 0)
                )
                return Slot(
                    location_id=loc_id,
                    equip_id=equip_id,
                    street_num=rua_num,
                    equip_num=equip_num,
                    equip_type=tipo,
                    level=nivel,
                    position=pos,
                    capacity_l=cap,
                    is_top_level=(nivel == 1),
                    is_bottom_level=(nivel == niveis),
                    max_level=niveis,
                    max_position=escs_per_nivel,
                    occupant_count=occupant_count,
                )
    return None
