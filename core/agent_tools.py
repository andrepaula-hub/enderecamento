"""API pública do agente de endereçamento automático.

Expõe as funções usadas pelas rotas: infer_store_context, validate_plan,
auto_address_preview e apply_auto_address.

O engine de scoring, dataclasses e helpers de normalização vivem em
agent_scoring.py para manter este arquivo focado no fluxo de dados.
"""
from __future__ import annotations

import re
from typing import Any

from .agent_scoring import (
    COMPATIBILITY,
    AgentRules,
    Slot,
    _add_placement_to_index,
    _as_list,
    _build_existing_placements,
    _build_placement_index,
    _category_group,
    _commit_product_to_slot,
    _group,
    _hard_rule_violations,
    _normalize_curve_zones,
    _normalize_equip_id,
    _normalize_equip_type,
    _normalize_text,
    _parse_int,
    _pick_slots_for_product,
    _placement_for_slot,
    _product_code,
    _required_bins,
    _required_volume_l,
    _slot_from_row,
    _sort_products_for_allocation,
)
from .gsheets_client import GSheetsClient
from .gsheets_backend import (
    SHEET_BASE_PRODUTOS,
    SHEET_PLANO_FINAL,
    save_batch_moves_gsheet,
    save_plano_version_gsheet,
    generate_kdabra_enderecar_sheet_gsheet,
)
from .utils import normalize_string, parse_bool_flag, parse_number


UNALLOCATED_ID = "UNALLOCATED"
DEFAULT_ETL_MASTER_LINK = "https://docs.google.com/spreadsheets/d/1mCoybEaeIFGfr12mt2-vAooeLDRCQJw7NOZlWD5WDxk"


# ── API pública ───────────────────────────────────────────────────────────────

def infer_store_context(sheet_id: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    title = client.get_title()
    return {
        "success": True,
        "sheet_id": sheet_id,
        "spreadsheet_title": title,
        "store_name": _infer_store_name(title),
    }


def infer_metabase_store_id(store_name: str, store_options: list[dict[str, str]]) -> str:
    normalized_store = _normalize_text(store_name)
    if not normalized_store:
        return ""
    normalized_store = re.sub(r"\b(enderecamento|dark|etl|teste|conferencia|produtos|loja)\b", " ", normalized_store)
    normalized_store = re.sub(r"\s+", " ", normalized_store).strip()
    direct = normalized_store.replace(" ", "")
    for item in store_options:
        value = normalize_string(item.get("value"))
        label = normalize_string(item.get("label"))
        if not value:
            continue
        normalized_value = _normalize_text(value)
        normalized_label = _normalize_text(label)
        if normalized_store == normalized_value or normalized_store == normalized_label:
            return value
        if direct == normalized_value.replace(" ", "") or direct == normalized_label.replace(" ", ""):
            return value
        if normalized_store in normalized_label or normalized_label in normalized_store:
            return value
    return ""


def validate_plan(sheet_id: str, chemical_equipment_ids: list[str] | None = None) -> dict[str, Any]:
    rows = _read_plan_rows(sheet_id)
    issues: list[dict[str, Any]] = []
    chemical_equips = {_normalize_equip_id(eid) for eid in (chemical_equipment_ids or []) if str(eid or "").strip()}

    loc_products: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        code = _product_code(row)
        if not code:
            continue
        loc = normalize_string(row.get("location_id"))
        loc_products.setdefault(loc, []).append(row)
        slot = _slot_from_row(row, occupant_count=1)
        product = _product_from_row(row)
        reasons = _hard_rule_violations(product, slot, AgentRules(), chemical_equips, validate_chemical_zone=bool(chemical_equips))
        for reason in reasons:
            issues.append({"type": "hard_rule", "location_id": loc, "product_code": code, "reason": reason})

    for loc, products in loc_products.items():
        if len(products) > 2:
            issues.append({"type": "hard_rule", "location_id": loc, "reason": "Mais de 2 produtos no mesmo endereco."})
        subcats = [_normalize_text(p.get("subcategoria")) for p in products if _normalize_text(p.get("subcategoria"))]
        if len(subcats) != len(set(subcats)):
            issues.append({"type": "hard_rule", "location_id": loc, "reason": "Subcategoria repetida no mesmo endereco."})

    return {
        "success": True,
        "checked_locations": len(loc_products),
        "issue_count": len(issues),
        "issues": issues,
    }


def auto_address_preview(
    sheet_id: str,
    *,
    chemical_equipment_ids: list[str] | None = None,
    allow_top_level: bool = False,
    allow_second_slot: bool = False,
    scope: dict[str, Any] | None = None,
    curve_zones: dict[str, Any] | None = None,
) -> dict[str, Any]:
    rules = AgentRules(allow_top_level=allow_top_level, allow_second_slot=allow_second_slot)
    base_rows = _read_base_rows(sheet_id)
    plan_rows = _read_plan_rows(sheet_id)
    readiness_errors = _validate_preview_inputs(base_rows, plan_rows)
    if readiness_errors:
        return {
            "success": False,
            "error": "Prévia bloqueada: dados essenciais ausentes ou ETL/plano incompletos.",
            "readiness_errors": readiness_errors,
        }
    chemical_equips = {_normalize_equip_id(eid) for eid in (chemical_equipment_ids or []) if str(eid or "").strip()}
    products = _build_missing_product_groups(base_rows, plan_rows)
    products = _filter_products_by_scope(products, scope)
    data_issue_unallocated: list[dict[str, Any]] = []
    allocatable_products: list[dict[str, Any]] = []
    for product in products:
        data_issues = _product_data_issues(product)
        if data_issues:
            summary = _product_summary(product)
            summary["reasons"] = data_issues
            data_issue_unallocated.append(summary)
            continue
        allocatable_products.append(product)
    products = allocatable_products
    slots = _build_available_slots(plan_rows, base_rows, allow_second_slot=allow_second_slot, scope=scope)
    placements = _build_existing_placements(plan_rows, base_rows)
    placement_index = _build_placement_index(placements)
    curve_zone_map = _normalize_curve_zones(curve_zones)

    decision_required: list[dict[str, Any]] = []
    has_chemical = any(_group(p) == "quimico" for p in products)
    if has_chemical and not chemical_equips:
        decision_required.append(
            {
                "code": "chemical_zone_missing",
                "message": "Ha quimicos no mix, mas nenhum equipamento/zona afastada foi informado.",
            }
        )

    if allow_top_level:
        decision_required.append({"code": "top_level_enabled", "message": "Nivel mais alto liberado nesta previa."})
    if allow_second_slot:
        decision_required.append({"code": "second_slot_enabled", "message": "Dois produtos por endereco liberado nesta previa."})

    proposed_moves: list[dict[str, Any]] = []
    hard_blocked: list[dict[str, Any]] = []
    unallocated: list[dict[str, Any]] = list(data_issue_unallocated)

    slots_by_location = {slot.location_id: slot for slot in slots}
    reserved_locations: set[str] = set()

    for product in _sort_products_for_allocation(products):
        required = int(product.get("_missing_required") or 1)
        candidates = _pick_slots_for_product(product, required, slots, rules, chemical_equips, reserved_locations, placement_index, curve_zone_map)
        if len(candidates) != required:
            unallocated.append(_product_summary(product))
            continue
        blocked_reasons: list[str] = []
        for candidate in candidates:
            blocked_reasons.extend(
                _hard_rule_violations(product, candidate, rules, chemical_equips, validate_chemical_zone=bool(chemical_equips))
            )
        if blocked_reasons:
            hard_blocked.append(
                {
                    "product": _product_summary(product),
                    "location_ids": [candidate.location_id for candidate in candidates],
                    "reasons": sorted(set(blocked_reasons)),
                }
            )
            unallocated.append(_product_summary(product))
            continue
        for unit_idx, candidate in enumerate(candidates, start=1):
            move_product = dict(product)
            move_product["_unit_index"] = unit_idx
            move = _move_for_product(move_product, candidate.location_id)
            proposed_moves.append(move)
            reserved_locations.add(candidate.location_id)
            slot_ref = slots_by_location.get(candidate.location_id)
            if slot_ref:
                _commit_product_to_slot(slot_ref, product)
                _add_placement_to_index(placement_index, _placement_for_slot(product, slot_ref))

    summary = {
        "products_to_allocate": sum(int(product.get("_missing_required") or 1) for product in products),
        "sku_groups_to_allocate": len(products),
        "proposed_moves": len(proposed_moves),
        "unallocated": len(unallocated),
        "hard_blocked": len(hard_blocked),
        "data_issue_unallocated": len(data_issue_unallocated),
        "available_slots": len(slots),
        "decision_required": len(decision_required),
        "uses_top_level": any(_is_top_location(move["locNovoId"], slots_by_location) for move in proposed_moves),
        "uses_second_slot": any(
            (slots_by_location.get(move["locNovoId"].replace("bin-", "")) or Slot("", "", None, None, "", None, None, None, False, False)).occupant_count > 1
            for move in proposed_moves
        ),
    }

    return {
        "success": True,
        "dry_run": True,
        "summary": summary,
        "decision_required": decision_required,
        "proposed_moves": proposed_moves,
        "unallocated": unallocated[:200],
        "hard_blocked": hard_blocked[:200],
        "warnings": _build_preview_warnings(summary, decision_required),
    }


def apply_auto_address(
    sheet_id: str,
    moves: list[dict[str, Any]],
    *,
    user: str = "agent",
    version_name: str | None = None,
    export_kdabra: bool = False,
) -> dict[str, Any]:
    if not moves:
        return {"success": False, "error": "Nenhum movimento informado para aplicar."}
    result = save_batch_moves_gsheet(sheet_id, moves, user=user)
    if not result.get("success"):
        return result

    output: dict[str, Any] = {"success": True, "apply": result}
    if version_name:
        output["version"] = save_plano_version_gsheet(sheet_id, version_name)
    if export_kdabra:
        output["kdabra"] = generate_kdabra_enderecar_sheet_gsheet(sheet_id)
    return output


# ── leitores de dados ─────────────────────────────────────────────────────────

def _read_base_rows(sheet_id: str) -> list[dict[str, Any]]:
    return GSheetsClient(sheet_id).read_sheet(SHEET_BASE_PRODUTOS)


def _read_plan_rows(sheet_id: str) -> list[dict[str, Any]]:
    return GSheetsClient(sheet_id).read_sheet(SHEET_PLANO_FINAL)


def _validate_preview_inputs(base_rows: list[dict[str, Any]], plan_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    if not base_rows:
        errors.append({"code": "base_produtos_empty", "message": "Base_Produtos vazia ou ausente. Rode o ETL antes da prévia."})
    if not plan_rows:
        errors.append({"code": "plano_empty", "message": "Plano_Enderecamento_Final vazio ou ausente. Gere escaninhos antes da prévia."})

    missing_group: list[dict[str, str]] = []
    missing_required: list[dict[str, str]] = []
    for row in base_rows:
        code = _product_code(row)
        if not code:
            continue
        if not _normalize_text(row.get("grupo") or row.get("grupo_alocado")):
            missing_group.append({"product_code": code, "product_name": normalize_string(row.get("product_name"))})
        if parse_number(row.get("escaninhos_necessarios")) is None:
            missing_required.append({"product_code": code, "product_name": normalize_string(row.get("product_name"))})

    if missing_group:
        errors.append(
            {
                "code": "missing_group",
                "message": f"{len(missing_group)} produto(s) sem grupo. Corrija o ETL/dicionário antes de endereçar.",
                "examples": missing_group[:20],
            }
        )
    if missing_required:
        errors.append(
            {
                "code": "missing_escaninhos_necessarios",
                "message": f"{len(missing_required)} produto(s) sem escaninhos_necessarios.",
                "examples": missing_required[:20],
            }
        )
    return errors


def _product_data_issues(product: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    if not _normalize_text(product.get("categoria_armazenagem") or product.get("cat_armz")):
        issues.append("Produto sem categoria_armazenagem; mantido em nao alocados.")
    return issues


def _infer_store_name(title: str | None) -> str:
    text = normalize_string(title)
    if not text:
        return ""
    bracket = re.search(r"\[([^\]]+)\]", text)
    if bracket:
        return bracket.group(1).strip()
    cleaned = re.sub(r"(?i)\b(enderecamento|dark|etl|teste|copia|cópia|de)\b", " ", text)
    cleaned = re.sub(r"[_\-\(\)\[\]]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


# ── construtores de slots ─────────────────────────────────────────────────────

def _build_missing_product_groups(base_rows: list[dict[str, Any]], plan_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    allocated: dict[str, int] = {}
    for row in plan_rows:
        code = _product_code(row)
        if code:
            allocated[code] = allocated.get(code, 0) + 1

    groups: list[dict[str, Any]] = []
    for row in base_rows:
        code = _product_code(row)
        if not code:
            continue
        required_total = _required_bins(row)
        already = allocated.get(code, 0)
        missing = required_total - already
        if missing <= 0:
            continue
        entry = dict(row)
        entry["_missing_required"] = missing
        entry["_required_total"] = required_total
        groups.append(entry)
    return groups


def _build_available_slots(
    plan_rows: list[dict[str, Any]],
    base_rows: list[dict[str, Any]],
    *,
    allow_second_slot: bool,
    scope: dict[str, Any] | None,
) -> list[Slot]:
    product_by_code = {_product_code(row): row for row in base_rows if _product_code(row)}
    by_loc: dict[str, list[dict[str, Any]]] = {}
    for row in plan_rows:
        loc = normalize_string(row.get("location_id"))
        if not loc:
            continue
        if not _slot_in_scope(row, scope):
            continue
        by_loc.setdefault(loc, []).append(row)

    slots: list[Slot] = []
    for loc, rows in by_loc.items():
        occupied = [row for row in rows if _product_code(row)]
        empty_rows = [row for row in rows if not _product_code(row)]
        base_row = empty_rows[0] if empty_rows else rows[0]
        if empty_rows:
            slots.append(_slot_from_row(base_row, occupant_count=len(occupied), occupied_rows=occupied, product_by_code=product_by_code))
            continue
        if allow_second_slot and len(occupied) == 1:
            slots.append(_slot_from_row(base_row, occupant_count=1, occupied_rows=occupied, product_by_code=product_by_code))
    return slots


def _product_from_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "product_code": _product_code(row),
        "product_name": row.get("product_name"),
        "grupo": row.get("grupo") or row.get("grupo_alocado"),
        "categoria_armazenagem": row.get("categoria_armazenagem"),
        "subcategoria": row.get("subcategoria"),
        "is_pesado": row.get("is_pesado"),
        "peso_kg_unitario": row.get("peso_kg_unitario"),
        "vol_L_unitario": row.get("vol_L_unitario") or row.get("vol_l_unitario"),
        "quantidade": row.get("quantidade"),
        "curva": row.get("curva"),
    }


# ── filtro de escopo ──────────────────────────────────────────────────────────

def _filter_products_by_scope(products: list[dict[str, Any]], scope: dict[str, Any] | None) -> list[dict[str, Any]]:
    # Product scope is currently store-wide; street/equipment scopes are applied on slots.
    return products


def _slot_in_scope(row: dict[str, Any], scope: dict[str, Any] | None) -> bool:
    if not scope:
        return True
    scope_type = normalize_string(scope.get("type")).lower()
    if _scope_has_street_filter(scope) and not _street_matches_scope(row, scope):
        return False
    if _scope_has_equipment_filter(scope):
        wanted_equips = {_normalize_equip_id(v) for v in _as_list(scope.get("equipment_ids", scope.get("equipamentos", [])))}
        slot = _slot_from_row(row)
        if _normalize_equip_id(slot.equip_id) not in wanted_equips:
            return False
    if _scope_has_equipment_type_filter(scope) and not _equipment_type_matches_scope(row, scope):
        return False

    if scope_type in {"", "store", "loja"}:
        return True
    if scope_type in {"street", "rua"}:
        return _street_matches_scope(row, scope)
    if scope_type in {"equipment", "equipamento"}:
        wanted = {_normalize_equip_id(v) for v in _as_list(scope.get("equipment_ids", scope.get("equipamentos", [])))}
        slot = _slot_from_row(row)
        return _normalize_equip_id(slot.equip_id) in wanted
    if scope_type in {"equipment_type", "tipo_equipamento"}:
        wanted = {_normalize_equip_type(v) for v in _as_list(scope.get("equipment_types", scope.get("tipos", [])))}
        equip_type = _normalize_equip_type(row.get("tipo_equipamento_final") or row.get("tipo_equipamento"))
        return equip_type in wanted
    if scope_type in {"geladeiras", "geladeira"}:
        equip_type = _normalize_equip_type(row.get("tipo_equipamento_final") or row.get("tipo_equipamento"))
        return "geladeira" in equip_type
    if scope_type in {"prateleiras", "prateleira"}:
        equip_type = _normalize_equip_type(row.get("tipo_equipamento_final") or row.get("tipo_equipamento"))
        return "prateleira" in equip_type
    if scope_type in {"freezers", "freezer"}:
        equip_type = _normalize_equip_type(row.get("tipo_equipamento_final") or row.get("tipo_equipamento"))
        return "freezer" in equip_type
    return True


def _scope_has_street_filter(scope: dict[str, Any]) -> bool:
    return bool(scope.get("rua") or scope.get("ruas") or scope.get("street") or scope.get("streets"))


def _street_matches_scope(row: dict[str, Any], scope: dict[str, Any]) -> bool:
    wanted = (
        {_normalize_text(v) for v in _as_list(scope.get("ruas", scope.get("streets", [])))}
        or {_normalize_text(scope.get("rua") or scope.get("street"))}
    )
    return _normalize_text(row.get("rua_num")) in wanted


def _scope_has_equipment_filter(scope: dict[str, Any]) -> bool:
    return bool(scope.get("equipment_ids") or scope.get("equipamentos"))


def _scope_has_equipment_type_filter(scope: dict[str, Any]) -> bool:
    return bool(scope.get("equipment_types") or scope.get("tipos"))


def _equipment_type_matches_scope(row: dict[str, Any], scope: dict[str, Any]) -> bool:
    wanted = {_normalize_equip_type(v) for v in _as_list(scope.get("equipment_types", scope.get("tipos", [])))}
    equip_type = _normalize_equip_type(row.get("tipo_equipamento_final") or row.get("tipo_equipamento"))
    return equip_type in wanted


# ── helpers de preview ────────────────────────────────────────────────────────

def _move_for_product(product: dict[str, Any], location_id: str) -> dict[str, Any]:
    code = _product_code(product)
    return {
        "productCode": code,
        "locAnteriorId": UNALLOCATED_ID,
        "locNovoId": f"bin-{location_id}",
        "productInfo": {
            "product_code": code,
            "product_name": normalize_string(product.get("product_name")),
            "quantidade": product.get("quantidade"),
            "curva": product.get("curva"),
            "grupo": product.get("grupo"),
            "categoria_armazenagem": product.get("categoria_armazenagem"),
            "vol_L_unitario": product.get("vol_L_unitario") or product.get("vol_l_unitario"),
            "venda_total": product.get("venda_total"),
            "nm_fabricante": product.get("nm_fabricante"),
            "altura_cm": product.get("altura_cm"),
            "peso_kg_unitario": product.get("peso_kg_unitario"),
            "subcategoria": product.get("subcategoria"),
            "is_pesado": parse_bool_flag(product.get("is_pesado")),
            "is_alto": parse_bool_flag(product.get("is_alto")),
        },
    }


def _product_summary(product: dict[str, Any]) -> dict[str, Any]:
    return {
        "product_code": _product_code(product),
        "product_name": normalize_string(product.get("product_name")),
        "grupo": product.get("grupo"),
        "categoria_armazenagem": product.get("categoria_armazenagem"),
        "curva": product.get("curva"),
        "unit_index": product.get("_unit_index"),
        "required_total": product.get("_required_total"),
    }


def _is_top_location(loc_novo_id: str, slots_by_location: dict[str, Slot]) -> bool:
    loc = normalize_string(loc_novo_id).replace("bin-", "")
    slot = slots_by_location.get(loc)
    return bool(slot and slot.is_top_level)


def _build_preview_warnings(summary: dict[str, Any], decision_required: list[dict[str, Any]]) -> list[str]:
    warnings: list[str] = []
    if summary.get("unallocated"):
        warnings.append(f"{summary['unallocated']} unidade(s) ficaram sem endereco na previa.")
    if summary.get("hard_blocked"):
        warnings.append(f"{summary['hard_blocked']} tentativa(s) foram bloqueadas por regra dura.")
    for item in decision_required:
        msg = item.get("message")
        if msg:
            warnings.append(str(msg))
    return warnings
