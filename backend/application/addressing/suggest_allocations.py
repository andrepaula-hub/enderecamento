"""Sugestão de alocação inteligente com regras FLV/pesado/quimico."""
from __future__ import annotations

import re
from collections import Counter
from typing import Any

from core.agent_scoring import (
    AgentRules,
    Slot,
    _add_placement_to_index,
    _build_placement_index,
    _commit_product_to_slot,
    _group,
    _hard_rule_violations,
    _normalize_curve_zones,
    _normalize_equip_id,
    _normalize_text,
    _pick_slots_for_product,
    _placement_for_slot,
    _sort_products_for_allocation,
)
from core.utils import normalize_string


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
    chemical_equips = {
        _normalize_equip_id(eid)
        for eid in (options.get("chemical_equipment_ids") or [])
        if str(eid or "").strip()
    }
    curve_zones = _normalize_curve_zones(options.get("curve_zones"))
    rules = AgentRules(allow_top_level=allow_top_level, allow_second_slot=allow_second_slot)

    # Map React Product → scoring dict
    products_by_code: dict[str, dict[str, Any]] = {}
    for p in products_data:
        code = str(p.get("id") or p.get("product_code") or "").strip()
        if not code:
            continue
        products_by_code[code] = _react_product_to_scoring(p)

    requested_counts = Counter(code for code in unallocated_codes if code in products_by_code)
    allocated_counts = Counter(
        str(code)
        for alloc in allocations.values()
        if isinstance(alloc, dict)
        for code in (alloc.get("p1"), alloc.get("p2"))
        if code
    )
    products_to_allocate = []
    for code in unallocated_codes:
        if code not in requested_counts:
            continue
        product = dict(products_by_code[code])
        required_from_product = max(1, int(product.get("escaninhos_necessarios") or 1))
        remaining_required = max(0, required_from_product - allocated_counts.get(code, 0))
        requested = min(requested_counts[code], remaining_required)
        if requested <= 0:
            del requested_counts[code]
            continue
        product["escaninhos_necessarios"] = requested
        products_to_allocate.append(product)
        del requested_counts[code]

    # Build slots from map_structure + current allocations
    slots = _slots_from_map(map_structure, allocations, allow_second_slot)

    # Build placement index from already-allocated products (for adjacency penalty)
    existing_placements: list[dict[str, Any]] = []
    for loc_id, alloc in allocations.items():
        for field in ("p1", "p2"):
            code = alloc.get(field) if isinstance(alloc, dict) else None
            if not code:
                continue
            product = products_by_code.get(str(code))
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

    for product in _sort_products_for_allocation(products_to_allocate):
        code = str(product.get("product_code") or "")
        required = max(1, int(product.get("escaninhos_necessarios") or 1))
        candidates = _pick_slots_for_product(
            product, required, slots, rules, chemical_equips,
            reserved_locations, placement_index, product_placement_index, curve_zones,
        )
        if len(candidates) != required:
            unallocated_out.append(code)
            continue

        blocked = []
        for candidate in candidates:
            blocked.extend(
                _hard_rule_violations(product, candidate, rules, chemical_equips, validate_chemical_zone=bool(chemical_equips))
            )
        if blocked:
            unallocated_out.append(code)
            continue

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

def _react_product_to_scoring(p: dict[str, Any]) -> dict[str, Any]:
    return {
        "product_code": str(p.get("id") or p.get("product_code") or ""),
        "product_name": str(p.get("nome") or p.get("product_name") or ""),
        "grupo": str(p.get("grupo") or ""),
        "curva": str(p.get("curva") or ""),
        "subcategoria": str(p.get("sub") or p.get("subcategoria") or ""),
        "peso_kg_unitario": float(p.get("peso") or p.get("peso_kg") or 0),
        "vol_L_unitario": float(p.get("vol") or p.get("vol_L_unitario") or 0),
        "quantidade": int(p.get("qtd") or p.get("quantidade") or 1),
        "escaninhos_necessarios": int(p.get("escsNec") or p.get("escaninhos_necessarios") or 1),
        "is_pesado": bool(p.get("pesado") or p.get("is_pesado") or False),
        "is_fragil": bool(p.get("fragil") or p.get("is_fragil") or False),
        "categoria_armazenagem": str(p.get("arm") or p.get("categoria_armazenagem") or ""),
        "degelo": str(p.get("degelo") or ""),
    }


def _slots_from_map(
    map_structure: list[dict[str, Any]],
    allocations: dict[str, dict[str, str | None]],
    allow_second_slot: bool,
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
                    occupant_count = (1 if p1 else 0) + (1 if p2 else 0)
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
                occupant_count = (1 if p1 else 0) + (1 if p2 else 0)
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
