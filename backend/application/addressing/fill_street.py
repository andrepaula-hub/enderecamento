from __future__ import annotations

from collections import Counter
from typing import Any

from backend.application.addressing.suggest_allocations import BLOCKED_SLOT_CODE, _entry_product_code, suggest_allocations


def fill_street_allocations(
    unallocated_codes: list[str],
    products_data: list[dict[str, Any]],
    map_structure: list[dict[str, Any]],
    allocations: dict[str, dict[str, str | None]],
    target_groups: list[dict[str, Any]],
    options: dict[str, Any],
) -> dict[str, Any]:
    """Preenche uma rua por grupos sequenciais sem exigir múltiplas chamadas do frontend."""
    working_allocations = {
        str(location_id): {
            "p1": alloc.get("p1") if isinstance(alloc, dict) else None,
            "p2": alloc.get("p2") if isinstance(alloc, dict) else None,
        }
        for location_id, alloc in (allocations or {}).items()
    }
    remaining_codes = [_entry_product_code(code) for code in (unallocated_codes or []) if _entry_product_code(code)]
    all_moves: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []
    total_targets = 0

    if bool((options or {}).get("whole_street")):
        return _fill_whole_street(
            remaining_codes=remaining_codes,
            products_data=products_data,
            map_structure=map_structure,
            working_allocations=working_allocations,
            target_groups=target_groups,
            options=options,
        )

    for group in target_groups or []:
        targets = [str(target) for target in (group.get("targets") or []) if str(target or "").strip()]
        equipment_id = str(group.get("equipmentId") or group.get("equipment_id") or "")
        total_targets += len(targets)
        if not targets or not remaining_codes:
            summaries.append({"equipmentId": equipment_id, "targets": len(targets), "proposed": 0})
            continue

        scoped_allocations = _build_scoped_allocations(map_structure, working_allocations, set(targets))
        result = suggest_allocations(
            unallocated_codes=remaining_codes,
            products_data=products_data,
            map_structure=map_structure,
            allocations=scoped_allocations,
            options=options,
        )
        if not result.get("success"):
            return result

        target_set = set(targets)
        moves = [
            {
                "escaninhoId": move.get("escaninhoId"),
                "productCode": move.get("productCode"),
                "slot": move.get("slot") or 1,
                "equipmentId": equipment_id,
            }
            for move in result.get("moves", [])
            if move.get("escaninhoId") in target_set and move.get("productCode")
        ]
        all_moves.extend(moves)
        _apply_moves(working_allocations, moves)
        remaining_codes = _remove_used_codes(remaining_codes, [move["productCode"] for move in moves])
        summaries.append({"equipmentId": equipment_id, "targets": len(targets), "proposed": len(moves)})

    return {
        "success": True,
        "moves": all_moves,
        "summary": {
            "target_groups": len(target_groups or []),
            "targets": total_targets,
            "proposed": len(all_moves),
            "remaining_codes": len(remaining_codes),
            "groups": summaries,
        },
    }


def _fill_whole_street(
    *,
    remaining_codes: list[str],
    products_data: list[dict[str, Any]],
    map_structure: list[dict[str, Any]],
    working_allocations: dict[str, dict[str, str | None]],
    target_groups: list[dict[str, Any]],
    options: dict[str, Any],
) -> dict[str, Any]:
    """Resolve todos os escaninhos alvo da rua em uma única rodada de scoring."""
    targets_by_equipment: dict[str, set[str]] = {}
    all_targets: set[str] = set()
    for group in target_groups or []:
        equipment_id = str(group.get("equipmentId") or group.get("equipment_id") or "")
        targets = {str(target) for target in (group.get("targets") or []) if str(target or "").strip()}
        if not targets:
            continue
        all_targets.update(targets)
        if equipment_id:
            targets_by_equipment.setdefault(equipment_id, set()).update(targets)

    if not all_targets or not remaining_codes:
        return {
            "success": True,
            "moves": [],
            "summary": {
                "target_groups": len(target_groups or []),
                "targets": len(all_targets),
                "proposed": 0,
                "remaining_codes": len(remaining_codes),
                "groups": [
                    {"equipmentId": equipment_id, "targets": len(targets), "proposed": 0}
                    for equipment_id, targets in targets_by_equipment.items()
                ],
                "mode": "whole_street",
            },
        }

    moves: list[dict[str, Any]] = []
    rejected_codes: list[str] = []
    guard = 0
    while remaining_codes and guard < max(len(all_targets), 1):
        guard += 1
        open_targets = _open_target_ids(working_allocations, all_targets)
        if not open_targets:
            break

        scoped_allocations = _build_scoped_allocations(map_structure, working_allocations, open_targets)
        result = suggest_allocations(
            unallocated_codes=remaining_codes,
            products_data=products_data,
            map_structure=map_structure,
            allocations=scoped_allocations,
            options=options,
        )
        if not result.get("success"):
            return result

        iteration_moves = [
            {
                "escaninhoId": move.get("escaninhoId"),
                "productCode": move.get("productCode"),
                "slot": move.get("slot") or 1,
                "equipmentId": _equipment_id_from_location(move.get("escaninhoId")),
            }
            for move in result.get("moves", [])
            if move.get("escaninhoId") in open_targets and move.get("productCode")
        ]
        iteration_unallocated = [
            _entry_product_code(code)
            for code in (result.get("unallocated") or [])
            if _entry_product_code(code)
        ]
        if not iteration_moves:
            rejected_codes.extend(iteration_unallocated)
            break

        moves.extend(iteration_moves)
        _apply_moves(working_allocations, iteration_moves)
        used_codes = [move["productCode"] for move in iteration_moves]
        remaining_codes = _remove_used_codes(remaining_codes, used_codes + iteration_unallocated)
        rejected_codes.extend(iteration_unallocated)

    proposed_by_equipment = Counter(move["equipmentId"] for move in moves if move.get("equipmentId"))
    remaining_after = remaining_codes
    return {
        "success": True,
        "moves": moves,
        "summary": {
            "target_groups": len(target_groups or []),
            "targets": len(all_targets),
            "proposed": len(moves),
            "remaining_codes": len(remaining_after),
            "rejected_codes": len(rejected_codes),
            "groups": [
                {
                    "equipmentId": equipment_id,
                    "targets": len(targets),
                    "proposed": proposed_by_equipment.get(equipment_id, 0),
                }
                for equipment_id, targets in targets_by_equipment.items()
            ],
            "mode": "whole_street",
        },
    }


def _build_scoped_allocations(
    map_structure: list[dict[str, Any]],
    allocations: dict[str, dict[str, str | None]],
    allowed_targets: set[str],
) -> dict[str, dict[str, str | None]]:
    scoped: dict[str, dict[str, str | None]] = {}
    for street in map_structure or []:
        for equip in street.get("equipment", []) or []:
            equip_id = str(equip.get("id") or "")
            niveis = int(equip.get("niveis") or 5)
            escs_per_nivel = int(equip.get("escsPerNivel") or 7)
            for level in range(1, niveis + 1):
                for position in range(1, escs_per_nivel + 1):
                    location_id = f"{equip_id}-{level}-{position}"
                    current = allocations.get(location_id) or {}
                    if location_id in allowed_targets or current.get("p1") or current.get("p2"):
                        scoped[location_id] = {"p1": current.get("p1"), "p2": current.get("p2")}
                    else:
                        scoped[location_id] = {"p1": BLOCKED_SLOT_CODE, "p2": None}
    return scoped


def _open_target_ids(
    allocations: dict[str, dict[str, str | None]],
    target_ids: set[str],
) -> set[str]:
    open_targets: set[str] = set()
    for location_id in target_ids:
        current = allocations.get(location_id) or {}
        if not current.get("p1"):
            open_targets.add(location_id)
    return open_targets


def _apply_moves(allocations: dict[str, dict[str, str | None]], moves: list[dict[str, Any]]) -> None:
    for move in moves:
        location_id = str(move.get("escaninhoId") or "")
        product_code = str(move.get("productCode") or "")
        if not location_id or not product_code:
            continue
        current = allocations.setdefault(location_id, {"p1": None, "p2": None})
        if int(move.get("slot") or 1) == 2:
            current["p2"] = product_code
        else:
            current["p1"] = product_code


def _equipment_id_from_location(location_id: Any) -> str:
    parts = str(location_id or "").split("-")
    return "-".join(parts[:2]) if len(parts) >= 2 else ""


def _remove_used_codes(remaining_codes: list[str], used_codes: list[str]) -> list[str]:
    used = Counter(_entry_product_code(code) for code in used_codes if _entry_product_code(code))
    next_codes: list[str] = []
    for code in remaining_codes:
        if used.get(code, 0) > 0:
            used[code] -= 1
        else:
            next_codes.append(code)
    return next_codes
