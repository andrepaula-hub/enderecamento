from __future__ import annotations

import math
import re
import unicodedata
from collections import Counter
from typing import Any

import pandas as pd

from .gsheets_client import GSheetsClient
from .utils import normalize_string, parse_number

SHEET_BASE_PRODUTOS = "Base_Produtos"
SHEET_PLANO_FINAL = "Plano_Enderecamento_Final"
SHEET_CONFIG_OPER_TARGET = "Configuracoes_Operacionais"
SHEET_DIC_CAT_TARGET = "Dicionario_Categorias"
SHEET_VOLUMETRIA_TARGET = "Volumetria_Equipamentos"
SHEET_BARCODE_TARGET = "Código de barras produtos"
SHEET_EDICOES_MANUAIS = "Edicoes_Manuais"

BASE_OUTPUT_HEADERS = [
    "product_code",
    "product_name",
    "nm_fabricante",
    "categoria_armazenagem",
    "subcategoria",
    "categoria_site",
    "grupo",
    "altura_cm",
    "vol_L_unitario",
    "quantidade",
    "curva",
    "largura_cm",
    "comprimento_cm",
    "vol_L_total",
    "venda_total",
    "venda_media_diaria",
    "dias_estoque",
    "is_fragil",
    "degelo",
    "prioridade_alocacao",
    "escaninhos_necessarios",
    "tipo_equipamento_base",
    "escaninhos_necessarios_freezer",
    "escaninhos_necessarios_geladeira",
    "escaninhos_necessarios_geladeira_alta",
    "escaninhos_necessarios_prateleira",
    "escaninhos_necessarios_prateleira_lateral",
    "peso_kg_unitario",
    "peso_kg_total",
    "is_pesado",
    "caixaria",
    "qtd_em_caixas",
    "metodo",
    "caixa_volume_cm3_final",
    "caixas_necessarias",
]

PRESERVED_ALLOCATED_OVERRIDES = {
    "venda_total",
    "venda_media_diaria",
    "dias_estoque",
    "curva",
    "escaninhos_necessarios",
    "escaninhos_necessarios_freezer",
    "escaninhos_necessarios_geladeira",
    "escaninhos_necessarios_geladeira_alta",
    "escaninhos_necessarios_prateleira",
    "escaninhos_necessarios_prateleira_lateral",
}


def _strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _norm(text: Any) -> str:
    raw = str(text or "").strip().lower()
    raw = _strip_accents(raw)
    return re.sub(r"\s+", " ", raw)


def _norm_code(value: Any) -> str:
    return str(value or "").strip().upper()


def _to_float(value: Any, default: float = 0.0) -> float:
    parsed = parse_number(value)
    if parsed is None or math.isnan(parsed):
        return default
    return float(parsed)


def _to_float_cm3(value: Any, default: float = 0.0) -> float:
    text = str(value or "").strip()
    if text:
        compact = text.replace("\u00a0", "").replace(" ", "")
        if "," not in compact and re.match(r"^[+-]?[1-9]\d{0,2}(?:\.\d{3})+$", compact):
            try:
                return float(compact.replace(".", ""))
            except Exception:
                pass
    return _to_float(value, default)


def _to_int(value: Any, default: int = 0) -> int:
    parsed = parse_number(value)
    if parsed is None:
        return default
    try:
        return int(round(float(parsed)))
    except Exception:
        return default


def _safe_df(values: list[list[Any]]) -> pd.DataFrame:
    if not values:
        return pd.DataFrame()
    headers = [str(v or "").strip() for v in values[0]]
    rows = values[1:]
    if not headers:
        return pd.DataFrame()
    width = len(headers)
    padded = [row + [None] * (width - len(row)) for row in rows]
    return pd.DataFrame(padded, columns=headers)


def _row_from_record(record: dict[str, Any], headers: list[str]) -> list[Any]:
    return [record.get(col, "") for col in headers]


def _merge_preserved_allocated_row(existing_row: list[Any], record: dict[str, Any], headers: list[str]) -> list[Any]:
    merged = list(existing_row[: len(headers)]) + [""] * max(0, len(headers) - len(existing_row))
    for idx, header in enumerate(headers):
        if str(header or "").strip() in PRESERVED_ALLOCATED_OVERRIDES:
            merged[idx] = record.get(header, "")
    return merged[: len(headers)]


def _row_value(row: Any, key: str) -> Any:
    """Return a scalar from row[key], even if duplicated headers return a Series."""
    value = row.get(key)
    if isinstance(value, pd.Series):
        for item in value.tolist():
            if item not in (None, "", "nan", "NaN"):
                return item
        return value.iloc[0] if len(value.index) > 0 else None
    return value


def _find_sheet_name(client: GSheetsClient, candidates: list[str], required: bool = True) -> str | None:
    names = client.list_sheet_names()
    norm_map = {_norm(name): name for name in names}
    for candidate in candidates:
        match = norm_map.get(_norm(candidate))
        if match:
            return match
    if required:
        raise ValueError(f"Aba obrigatória não encontrada: {', '.join(candidates)}")
    return None


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    copy = df.copy()
    copy.columns = [str(col or "").strip() for col in copy.columns]
    return copy


def _pick_col(df: pd.DataFrame, candidates: list[str]) -> str | None:
    if df.empty:
        return None
    norm_cols = {_norm(col): col for col in df.columns}
    for cand in candidates:
        found = norm_cols.get(_norm(cand))
        if found:
            return found
    return None


def _find_header_index(headers: list[str], candidates: list[str]) -> int:
    norm_map: dict[str, int] = {}
    for idx, header in enumerate(headers):
        norm_map[_norm(header)] = idx
    for candidate in candidates:
        found = norm_map.get(_norm(candidate))
        if found is not None:
            return found
    return -1


def _extract_allocated_codes_from_plano_values(values: list[list[Any]]) -> set[str]:
    if not values:
        return set()
    headers = [str(h or "").strip() for h in values[0]]
    if not headers:
        return set()

    idx_loc = _find_header_index(headers, ["location_id"])
    idx_product = _find_header_index(headers, ["product_code", "produto_alocado_code"])
    idx_slot1 = _find_header_index(headers, ["slot1_code"])
    idx_slot2 = _find_header_index(headers, ["slot2_code"])

    allocated_codes: set[str] = set()
    for row in values[1:]:
        location_id = ""
        if idx_loc != -1 and idx_loc < len(row):
            location_id = normalize_string(row[idx_loc]).upper()
        if location_id in {"", "UNALLOCATED", "PRANCHETA"}:
            continue

        for idx in [idx_product, idx_slot1, idx_slot2]:
            if idx == -1 or idx >= len(row):
                continue
            code = _norm_code(row[idx])
            if code and code != "VAZIO":
                allocated_codes.add(code)
    return allocated_codes


def _prune_plan_values_to_valid_codes(values: list[list[Any]], valid_codes: set[str]) -> tuple[list[list[Any]], int]:
    """Remove alocações de SKUs que não existem mais no mix, preservando as linhas do mapa."""
    if not values:
        return values, 0
    headers = [str(h or "").strip() for h in values[0]]
    if not headers:
        return values, 0

    idx_product = _find_header_index(headers, ["product_code", "produto_alocado_code"])
    idx_slot1 = _find_header_index(headers, ["slot1_code"])
    idx_slot2 = _find_header_index(headers, ["slot2_code"])
    slot1_cols = [idx for idx, header in enumerate(headers) if _norm(header).startswith("slot1_")]
    slot2_cols = [idx for idx, header in enumerate(headers) if _norm(header).startswith("slot2_")]
    primary_clear_candidates = {
        "product_name",
        "produto_alocado_nome",
        "info_hover",
        "grupo",
        "cor_grupo",
        "curva",
        "subcategoria",
        "quantidade",
        "vol_l_unitario",
        "vol_L_unitario",
    }
    primary_clear_cols = [
        idx for idx, header in enumerate(headers)
        if header in primary_clear_candidates or _norm(header) in {_norm(item) for item in primary_clear_candidates}
    ]
    idx_slot_count = _find_header_index(headers, ["slot_count"])
    idx_slot_duplo = _find_header_index(headers, ["slot_duplo"])

    def clear_columns(row: list[Any], columns: list[int]) -> None:
        for col in columns:
            if 0 <= col < len(row):
                row[col] = ""

    pruned = [values[0]]
    removed = 0
    for raw in values[1:]:
        row = list(raw) + [""] * (len(headers) - len(raw))
        row_removed = 0

        if idx_product != -1 and idx_product < len(row):
            code = _norm_code(row[idx_product])
            if code and code != "VAZIO" and code not in valid_codes:
                row[idx_product] = "Vazio"
                clear_columns(row, primary_clear_cols)
                row_removed += 1

        if idx_slot1 != -1 and idx_slot1 < len(row):
            code = _norm_code(row[idx_slot1])
            if code and code != "VAZIO" and code not in valid_codes:
                clear_columns(row, slot1_cols)
                row_removed += 1

        if idx_slot2 != -1 and idx_slot2 < len(row):
            code = _norm_code(row[idx_slot2])
            if code and code != "VAZIO" and code not in valid_codes:
                clear_columns(row, slot2_cols)
                row_removed += 1

        if row_removed:
            removed += row_removed
            active_slots = 0
            for idx in [idx_slot1, idx_slot2]:
                if idx != -1 and idx < len(row):
                    code = _norm_code(row[idx])
                    if code and code != "VAZIO":
                        active_slots += 1
            if idx_slot_count != -1 and idx_slot_count < len(row):
                row[idx_slot_count] = active_slots
            if idx_slot_duplo != -1 and idx_slot_duplo < len(row):
                row[idx_slot_duplo] = "SIM" if active_slots >= 2 else "NAO"

        pruned.append(row)
    return pruned, removed


def _prune_plan_and_versions_to_valid_codes(target_client: GSheetsClient, valid_codes: set[str]) -> dict[str, Any]:
    sheet_names = target_client.list_sheet_names()
    plan_sheet_names = [
        name for name in sheet_names
        if name == SHEET_PLANO_FINAL
        or name.startswith("VERSAO_ENDERECAMENTO__")
        or bool(re.match(r"^.+_ENDERECAMENTO\[\d+\]$", name))
    ]
    cleaned_sheets = 0
    removed_allocations = 0
    for sheet_name in plan_sheet_names:
        values = target_client.read_values(sheet_name)
        pruned_values, removed = _prune_plan_values_to_valid_codes(values, valid_codes)
        if removed <= 0:
            continue
        target_client.clear_sheet(sheet_name)
        target_client.append_rows(sheet_name, pruned_values)
        cleaned_sheets += 1
        removed_allocations += removed
    return {
        "cleaned_plan_sheets": cleaned_sheets,
        "removed_plan_allocations": removed_allocations,
    }


def _read_manual_overrides(target_client: GSheetsClient) -> dict[str, dict[str, Any]]:
    """Read Edicoes_Manuais sheet and return {norm_code: {field: value}} for non-empty fields.

    Returns an empty dict silently when the sheet does not exist or is empty.
    """
    try:
        if SHEET_EDICOES_MANUAIS not in target_client.list_sheet_names():
            return {}
        values = target_client.read_values(SHEET_EDICOES_MANUAIS)
        if not values or len(values) < 2:
            return {}
        headers = [str(h or "").strip() for h in values[0]]
        code_idx = _find_header_index(headers, ["product_code", "cod_produto"])
        if code_idx == -1:
            return {}
        overrides: dict[str, dict[str, Any]] = {}
        for row in values[1:]:
            padded = list(row) + [""] * (len(headers) - len(row))
            code = _norm_code(padded[code_idx] if code_idx < len(padded) else "")
            if not code:
                continue
            fields: dict[str, Any] = {}
            for idx, header in enumerate(headers):
                if not header or header == "product_code":
                    continue
                val = padded[idx] if idx < len(padded) else ""
                if val not in (None, "", "nan", "NaN"):
                    fields[header] = val
            if fields:
                overrides[code] = fields
        return overrides
    except Exception:
        return {}


def _resolve_mix_sheet(mix_client: GSheetsClient) -> dict[str, Any] | None:
    for sheet_name in mix_client.list_sheet_names():
        values = mix_client.read_values(sheet_name)
        df = _normalize_columns(_safe_df(values))
        if df.empty:
            continue
        code_col = _pick_col(df, ["product_code", "cod_produto", "codigo", "sku"])
        name_col = _pick_col(df, ["product_name", "descricao", "desc_produto", "produto"])
        qty_col = _pick_col(df, ["Quantidade", "quantidade", "qtd", "qtd_total"])
        if code_col and name_col and qty_col:
            chosen_df = df[[code_col, name_col, qty_col]].copy()
            chosen_df.columns = ["product_code", "product_name", "quantidade"]
            headers = [str(h).strip() if h is not None else "" for h in (values[0] if values else [])]
            idx_code = headers.index(code_col) if code_col in headers else list(df.columns).index(code_col)
            idx_name = headers.index(name_col) if name_col in headers else list(df.columns).index(name_col)
            idx_qty = headers.index(qty_col) if qty_col in headers else list(df.columns).index(qty_col)
            return {
                "sheet_name": sheet_name,
                "headers": headers,
                "rows": [list(r) for r in values[1:]],
                "idx_code": idx_code,
                "idx_name": idx_name,
                "idx_qty": idx_qty,
                "mix_df": chosen_df,
            }
    return None


def _build_mix_df(mix_client: GSheetsClient) -> pd.DataFrame:
    resolved = _resolve_mix_sheet(mix_client)
    if not resolved:
        raise ValueError("Não encontrei aba de mix com colunas product_code, product_name e quantidade.")
    chosen_df = resolved["mix_df"].copy()

    chosen_df["product_code"] = chosen_df["product_code"].apply(_norm_code)
    chosen_df["product_name"] = chosen_df["product_name"].astype(str).str.strip()
    chosen_df["quantidade"] = chosen_df["quantidade"].apply(_to_int)
    chosen_df = chosen_df[(chosen_df["product_code"] != "") & (chosen_df["product_name"] != "")]
    return chosen_df


def sanitize_mix_duplicates(mix_sheet_id: str, target_sheet_id: str | None = None) -> dict[str, Any]:
    mix = GSheetsClient(mix_sheet_id)
    resolved = _resolve_mix_sheet(mix)
    if not resolved:
        return {"success": False, "error": "Não encontrei aba de mix com colunas product_code, product_name e quantidade."}

    sheet_name = str(resolved.get("sheet_name") or "")
    headers = list(resolved.get("headers") or [])
    rows = [list(r) for r in (resolved.get("rows") or [])]
    idx_code = int(resolved.get("idx_code"))
    idx_name = int(resolved.get("idx_name"))
    idx_qty = int(resolved.get("idx_qty"))

    duplicate_groups: dict[str, list[tuple[int, int]]] = {}
    for i, row in enumerate(rows):
        code = _norm_code(row[idx_code] if idx_code < len(row) else "")
        name = str(row[idx_name] if idx_name < len(row) and row[idx_name] is not None else "").strip()
        if not code or not name:
            continue
        qty = _to_int(row[idx_qty] if idx_qty < len(row) else 0, 0)
        duplicate_groups.setdefault(code, []).append((i, qty))

    removed_indices: set[int] = set()
    affected_codes: list[str] = []
    for code, items in duplicate_groups.items():
        if len(items) <= 1:
            continue
        affected_codes.append(code)
        max_qty = max(qty for _, qty in items)
        winner_idx = next(idx for idx, qty in items if qty == max_qty)
        for idx, _ in items:
            if idx != winner_idx:
                removed_indices.add(idx)

    cleared_base = False
    base_url = ""

    if not removed_indices:
        if target_sheet_id:
            target = GSheetsClient(target_sheet_id)
            target.ensure_sheet(SHEET_BASE_PRODUTOS)
            target.clear_sheet(SHEET_BASE_PRODUTOS)
            cleared_base = True
            base_url = target.get_sheet_url(SHEET_BASE_PRODUTOS)
        return {
            "success": True,
            "sanitized": False,
            "sheet_name": sheet_name,
            "sheet_url": mix.get_sheet_url(sheet_name),
            "duplicates_found": len(affected_codes),
            "rows_before": len(rows),
            "rows_after": len(rows),
            "rows_removed": 0,
            "affected_codes": affected_codes[:25],
            "base_produtos_cleared": cleared_base,
            "base_produtos_url": base_url,
        }

    kept_rows = [row for i, row in enumerate(rows) if i not in removed_indices]
    mix.clear_sheet(sheet_name)
    mix.append_rows(sheet_name, [headers] + kept_rows)
    if target_sheet_id:
        target = GSheetsClient(target_sheet_id)
        target.ensure_sheet(SHEET_BASE_PRODUTOS)
        target.clear_sheet(SHEET_BASE_PRODUTOS)
        cleared_base = True
        base_url = target.get_sheet_url(SHEET_BASE_PRODUTOS)

    return {
        "success": True,
        "sanitized": True,
        "sheet_name": sheet_name,
        "sheet_url": mix.get_sheet_url(sheet_name),
        "duplicates_found": len(affected_codes),
        "rows_before": len(rows),
        "rows_after": len(kept_rows),
        "rows_removed": len(removed_indices),
        "affected_codes": affected_codes[:25],
        "base_produtos_cleared": cleared_base,
        "base_produtos_url": base_url,
    }


def _build_map_from_df(df: pd.DataFrame, code_candidates: list[str], selected_cols: list[str]) -> dict[str, dict[str, Any]]:
    df = _normalize_columns(df)
    if df.empty:
        return {}
    code_col = _pick_col(df, code_candidates)
    if not code_col:
        return {}
    output: dict[str, dict[str, Any]] = {}
    for _, row in df.iterrows():
        code = _norm_code(_row_value(row, code_col))
        if not code:
            continue
        bucket = output.setdefault(code, {})
        for wanted in selected_cols:
            col = _pick_col(df, [wanted])
            if not col:
                continue
            value = _row_value(row, col)
            if value in (None, "", "nan", "NaN"):
                continue
            bucket[wanted] = value
    return output


def _extract_sales_map(df_vendas: pd.DataFrame) -> tuple[dict[str, float], dict[str, float]]:
    df = _normalize_columns(df_vendas)
    if df.empty:
        return {}, {}

    code_col = _pick_col(df, ["cod_produto", "id_produto", "product_code"])
    name_col = _pick_col(df, ["desc_produto", "descricao_produto", "product_name", "produto"])
    qty_col = _pick_col(df, ["qtd_total", "sum(ip.qtd_total)", "qtd"])

    if not qty_col:
        return {}, {}

    by_code: dict[str, float] = {}
    by_name: dict[str, float] = {}
    for _, row in df.iterrows():
        qty = _to_float(_row_value(row, qty_col), 0.0)
        if qty <= 0:
            continue
        code = _norm_code(_row_value(row, code_col)) if code_col else ""
        name = str(_row_value(row, name_col) or "").strip().upper() if name_col else ""
        if code:
            by_code[code] = by_code.get(code, 0.0) + qty
        elif name:
            by_name[name] = by_name.get(name, 0.0) + qty
    return by_code, by_name


def _extract_caixaria_map(df_caixaria: pd.DataFrame, df_caixaria_nova_values: list[list[Any]]) -> dict[str, float]:
    output: dict[str, float] = {}
    df = _normalize_columns(df_caixaria)
    if not df.empty:
        code_col = _pick_col(df, ["cod_produto", "codigo_produto", "product_code"])
        caix_col = _pick_col(df, ["caixaria"])
        if code_col and caix_col:
            for _, row in df.iterrows():
                code = _norm_code(_row_value(row, code_col))
                if not code:
                    continue
                value = _to_float(_row_value(row, caix_col), 0.0)
                if value > 0:
                    output[code] = value

    # Caixaria nova compras em alguns arquivos vem sem header.
    # Regra: usar apenas como fallback (não sobrescreve Caixaria) e ignorar outliers.
    fallback_max = 240.0
    for row in df_caixaria_nova_values:
        if not row:
            continue
        code = _norm_code(row[0] if len(row) > 0 else "")
        if not code or code == "COD_PRODUTO":
            continue
        if code in output:
            continue
        value = _to_float(row[1] if len(row) > 1 else None, 0.0)
        if value > 0 and value <= fallback_max:
            output[code] = value
    return output


def _extract_barcode_set(df_barcode: pd.DataFrame) -> set[str]:
    df = _normalize_columns(df_barcode)
    if df.empty:
        return set()
    code_col = _pick_col(df, ["cod_produto", "product_code"])
    if not code_col:
        return set()
    return {_norm_code(v) for v in df[code_col].tolist() if _norm_code(v)}


def _extract_limite_peso(df_config: pd.DataFrame) -> float:
    df = _normalize_columns(df_config)
    if df.empty:
        return 0.7
    key_col = _pick_col(df, ["parametro", "chave", "nome"])
    val_col = _pick_col(df, ["valor", "value"])
    if not key_col or not val_col:
        return 0.7
    for _, row in df.iterrows():
        key = _norm(_row_value(row, key_col))
        if key in {"limite_peso_kg", "limite_peso", "peso_limite_kg"}:
            value = _to_float(_row_value(row, val_col), 0.7)
            if value > 0:
                return value
    return 0.7


def _extract_capacity_map(df_vol_eq: pd.DataFrame) -> dict[str, float]:
    df = _normalize_columns(df_vol_eq)
    if df.empty:
        return {}
    tipo_col = _pick_col(df, ["tipo_equipamento", "tipo"])
    l_col = _pick_col(df, ["l_por_escaninho", "litros_por_escaninho"])
    fator_col = _pick_col(df, ["fator_seguranca", "fator"])
    if not tipo_col or not l_col:
        return {}
    out: dict[str, float] = {}
    for _, row in df.iterrows():
        tipo = _norm(_row_value(row, tipo_col)).replace(" ", "_")
        if not tipo:
            continue
        litros = _to_float(_row_value(row, l_col), 0.0)
        fator = _to_float(_row_value(row, fator_col), 1.0) if fator_col else 1.0
        capacidade = litros * (fator if fator > 0 else 1.0)
        if capacidade > 0:
            out[tipo] = capacidade
    return out


def _extract_category_group_map(df_dic_cat: pd.DataFrame) -> dict[str, str]:
    df = _normalize_columns(df_dic_cat)
    if df.empty:
        return {}
    category_col = _pick_col(df, ["categoria_site", "categoria", "categoria site"])
    group_col = _pick_col(df, ["grupo", "grupo_produto"])
    if not category_col or not group_col:
        return {}
    output: dict[str, str] = {}
    for _, row in df.iterrows():
        category = _norm(_row_value(row, category_col))
        group = _norm(_row_value(row, group_col))
        if category:
            output[category] = group
    return output


def _extract_subcategory_group_map(
    map_subcat: dict[str, dict[str, Any]],
    map_categoria_site: dict[str, dict[str, Any]],
    dic_cat_map: dict[str, str],
) -> dict[str, str]:
    broad_subcategories = {
        "novidades",
        "precos incriveis",
        "preços incriveis",
        "precos incríveis",
        "preços incríveis",
        "monte sua cesta",
        "para receber",
        "verao",
        "verão",
    }
    counters: dict[str, Counter[str]] = {}
    for code, subcat_data in map_subcat.items():
        subcategoria = _norm(subcat_data.get("subcategoria"))
        if subcategoria in broad_subcategories:
            continue
        categoria_site = _norm(map_categoria_site.get(code, {}).get("categoria"))
        grupo = dic_cat_map.get(categoria_site, "")
        if not subcategoria or not grupo:
            continue
        counters.setdefault(subcategoria, Counter())[grupo] += 1
    output: dict[str, str] = {}
    for subcategoria, counter in counters.items():
        total = sum(counter.values())
        group, count = counter.most_common(1)[0]
        if total >= 3 and count / total >= 0.8:
            output[subcategoria] = group
    return output


def _extract_weight_from_name(product_name: str) -> float:
    name = str(product_name or "").upper()
    if not name:
        return 0.0
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*(KG|G|L|ML)", name)
    if not match:
        return 0.0
    value = _to_float(match.group(1), 0.0)
    unit = match.group(2)
    if value <= 0:
        return 0.0
    if unit == "KG":
        return value
    if unit == "G":
        return value / 1000.0
    if unit == "L":
        return value
    if unit == "ML":
        return value / 1000.0
    return 0.0


def _tipo_equipamento_base(categoria_armazenagem: str, degelo: str) -> str:
    categoria = _norm(categoria_armazenagem)
    degelo_norm = _norm(degelo)
    if "freezer" in categoria or categoria == "congelado":
        return "freezer"
    if "geladeira" in categoria or categoria == "refrigerado":
        if degelo_norm.startswith("pode"):
            return "geladeira_alta"
        return "geladeira"
    if "lateral" in categoria:
        return "prateleira_lateral"
    return "prateleira"


def _to_json_rows(df: pd.DataFrame, cols: list[str], limit: int = 25) -> list[dict[str, Any]]:
    if df.empty:
        return []
    rows: list[dict[str, Any]] = []
    for _, row in df.head(limit).iterrows():
        rows.append({col: row.get(col) for col in cols})
    return rows


def _extract_duplicated_codes(mix_df: pd.DataFrame) -> list[str]:
    if mix_df.empty or "product_code" not in mix_df.columns:
        return []
    code_counter = Counter(mix_df["product_code"].tolist())
    return sorted([code for code, count in code_counter.items() if code and count > 1])


def _build_etl_warnings(
    df_out: pd.DataFrame,
    duplicated_codes: list[str] | None = None,
    barcode_codes: set[str] | None = None,
) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    if df_out.empty:
        return warnings

    df_w = df_out.copy()
    for col in [
        "product_code",
        "product_name",
        "categoria_armazenagem",
        "degelo",
        "vol_L_unitario",
        "caixa_volume_cm3_final",
        "caixas_necessarias",
        "caixaria",
        "quantidade",
        "metodo",
        "subcategoria",
        "categoria_site",
    ]:
        if col not in df_w.columns:
            df_w[col] = ""

    geladeira_missing_degelo = df_w[
        (df_w["categoria_armazenagem"].astype(str).str.lower().str.contains("geladeira|refrigerado"))
        & (df_w["degelo"].astype(str).str.strip() == "")
    ]
    if not geladeira_missing_degelo.empty:
        warnings.append(
            {
                "type": "degelo_geladeira_vazio",
                "title": "Produto de geladeira sem mapeamento de degelo",
                "count": int(len(geladeira_missing_degelo)),
                "examples": _to_json_rows(geladeira_missing_degelo, ["product_code", "product_name"]),
            }
        )

    vol_u_series = df_w["vol_L_unitario"].apply(lambda value: _to_float(value, 0.0))
    vol_cx_series = df_w["caixa_volume_cm3_final"].apply(lambda value: _to_float(value, 0.0))
    missing_vol = df_w[(vol_u_series <= 0) & (vol_cx_series <= 0)]
    if not missing_vol.empty:
        warnings.append(
            {
                "type": "volumetria_vazia",
                "title": "Produto sem volumetria",
                "count": int(len(missing_vol)),
                "examples": _to_json_rows(missing_vol, ["product_code", "product_name"]),
            }
        )

    caixas_series = df_w["caixas_necessarias"].apply(lambda value: _to_float(value, 0.0))
    caixaria_series = df_w["caixaria"].apply(lambda value: _to_float(value, 0.0))
    qtd_series = df_w["quantidade"].apply(lambda value: _to_float(value, 0.0))
    vol_total_unit_series = vol_u_series * qtd_series
    vol_total_caixa_series = (vol_cx_series * caixas_series) / 1000.0
    metodo_series = df_w["metodo"].astype(str).str.strip().str.lower()
    caixa_inconsistente = df_w[
        (caixaria_series > 1)
        & (vol_u_series > 0)
        & (vol_cx_series > 0)
        & (caixas_series > 0)
        & (vol_total_caixa_series < (vol_total_unit_series * 0.5))
        & (metodo_series != "caixa")
    ]
    if not caixa_inconsistente.empty:
        warnings.append(
            {
                "type": "caixaria_inconsistente",
                "title": "Caixaria ignorada por volume inconsistente",
                "count": int(len(caixa_inconsistente)),
                "examples": _to_json_rows(caixa_inconsistente, ["product_code", "product_name"]),
            }
        )

    missing_subcat = df_w[df_w["subcategoria"].astype(str).str.strip() == ""]
    if not missing_subcat.empty:
        warnings.append(
            {
                "type": "subcategoria_vazia",
                "title": "Produto sem subcategoria",
                "count": int(len(missing_subcat)),
                "examples": _to_json_rows(missing_subcat, ["product_code", "product_name"]),
            }
        )

    missing_cat_arm = df_w[df_w["categoria_armazenagem"].astype(str).str.strip() == ""]
    if not missing_cat_arm.empty:
        warnings.append(
            {
                "type": "categoria_armz_vazia",
                "title": "Produto sem categoria de armazenagem",
                "count": int(len(missing_cat_arm)),
                "examples": _to_json_rows(missing_cat_arm, ["product_code", "product_name"]),
            }
        )

    missing_cat_site = df_w[df_w["categoria_site"].astype(str).str.strip() == ""]
    if not missing_cat_site.empty:
        warnings.append(
            {
                "type": "categoria_site_vazia",
                "title": "Produto sem categoria site",
                "count": int(len(missing_cat_site)),
                "examples": _to_json_rows(missing_cat_site, ["product_code", "product_name"]),
            }
        )

    dup_codes = [code for code in (duplicated_codes or []) if code]
    if dup_codes:
        warnings.append(
            {
                "type": "duplicados_mix",
                "title": "Código duplicado no mix",
                "count": len(dup_codes),
                "examples": [{"product_code": code} for code in dup_codes[:25]],
            }
        )

    if barcode_codes:
        missing_barcode = df_w[~df_w["product_code"].isin(list(barcode_codes))]
        if not missing_barcode.empty:
            warnings.append(
                {
                    "type": "sem_barcode",
                    "title": "Produto sem cadastro em códigos de barras",
                    "count": int(len(missing_barcode)),
                    "examples": _to_json_rows(missing_barcode, ["product_code", "product_name"]),
                }
            )

    return warnings


def refresh_single_etl_warning(
    master_sheet_id: str,
    mix_sheet_id: str,
    target_sheet_id: str,
    warning_type: str,
) -> dict[str, Any]:
    warning_norm = _norm(warning_type)
    if not warning_norm:
        return {"success": False, "error": "Informe o tipo do alerta para refresh."}

    # Refresh needs to reflect the current master/mix sheets. Reading Base_Produtos
    # directly can keep showing stale warnings after the user fixes the source tabs.
    etl_result = run_etl_to_base_products(master_sheet_id, mix_sheet_id, target_sheet_id)
    if not etl_result.get("success"):
        return etl_result

    warnings = list(etl_result.get("warnings") or [])

    warning = next((item for item in warnings if _norm(item.get("type")) == warning_norm), None)
    if warning:
        return {"success": True, "resolved": False, "warning": warning}

    title_map = {
        "degelo_geladeira_vazio": "Produto de geladeira sem mapeamento de degelo",
        "volumetria_vazia": "Produto sem volumetria",
        "caixaria_inconsistente": "Caixaria ignorada por volume inconsistente",
        "subcategoria_vazia": "Produto sem subcategoria",
        "categoria_armz_vazia": "Produto sem categoria de armazenagem",
        "categoria_site_vazia": "Produto sem categoria site",
        "duplicados_mix": "Código duplicado no mix",
        "sem_barcode": "Produto sem cadastro em códigos de barras",
    }
    return {
        "success": True,
        "resolved": True,
        "warning": {
            "type": warning_type,
            "title": title_map.get(warning_norm, warning_type),
            "count": 0,
            "examples": [],
        },
    }


def _apply_escaninhos_cap(rows: list[list[Any]], headers: list[str]) -> None:
    """Cap escaninhos_necessarios: prateleira → 7, geladeira (PODE) → 5.
    Runs as the very last step before writing, so it catches all code paths."""
    if len(rows) < 2:
        return
    h = {str(v or "").strip(): i for i, v in enumerate(headers)}
    esc_col = h.get("escaninhos_necessarios", -1)
    cat_col = h.get("categoria_armazenagem", -1)
    degelo_col = h.get("degelo", -1)
    tipo_col = h.get("tipo_equipamento", -1)
    if esc_col == -1:
        return
    for row in rows[1:]:  # skip header row
        try:
            val = int(float(str(row[esc_col] or 0).replace(",", ".")))
        except (ValueError, TypeError, IndexError):
            continue
        cat = str(row[cat_col] if cat_col != -1 and cat_col < len(row) else "").lower()
        degelo = str(row[degelo_col] if degelo_col != -1 and degelo_col < len(row) else "").upper()
        tipo = str(row[tipo_col] if tipo_col != -1 and tipo_col < len(row) else "").lower()
        is_cold = "geladeira" in cat or "freezer" in cat or cat in ("refrigerado", "congelado")
        is_lateral = "lateral" in cat or "lateral" in tipo
        is_prateleira = not is_cold and not is_lateral
        if "geladeira" in cat and degelo.startswith("PODE") and val > 5:
            row[esc_col] = 5
        elif is_prateleira and val > 7:
            row[esc_col] = 7
    # Also cap the per-type columns
    for col_name, max_val in [
        ("escaninhos_necessarios_prateleira", 7),
        ("escaninhos_necessarios_prateleira_lateral", 7),
        ("escaninhos_necessarios_geladeira", 5),
        ("escaninhos_necessarios_geladeira_alta", 5),
    ]:
        col = h.get(col_name, -1)
        if col == -1:
            continue
        for row in rows[1:]:
            if col >= len(row):
                continue
            try:
                val = int(float(str(row[col] or 0).replace(",", ".")))
            except (ValueError, TypeError):
                continue
            if val > max_val:
                row[col] = max_val


def run_etl_to_base_products(master_sheet_id: str, mix_sheet_id: str, target_sheet_id: str) -> dict[str, Any]:
    master = GSheetsClient(master_sheet_id)
    mix = GSheetsClient(mix_sheet_id)
    target = GSheetsClient(target_sheet_id)
    target.ensure_sheet(SHEET_BASE_PRODUTOS)

    mix_df = _build_mix_df(mix)
    if mix_df.empty:
        return {"success": False, "error": "Mix vazio após leitura."}
    zero_qty_codes = {
        _norm_code(row.get("product_code"))
        for _, row in mix_df.iterrows()
        if _norm_code(row.get("product_code")) and _to_int(row.get("quantidade"), 0) <= 0
    }
    mix_df = mix_df[mix_df["quantidade"].apply(lambda value: _to_int(value, 0) > 0)].copy()
    if mix_df.empty:
        return {"success": False, "error": "Mix vazio após remover SKUs com quantidade menor ou igual a zero."}

    # Master sheets
    degelo_name = _find_sheet_name(master, ["Degelo"])
    categoria_gpt_name = _find_sheet_name(master, ["Categoria ChatGPT"])
    categoria_site_name = _find_sheet_name(master, ["Categoria Site"])
    subcategorias_name = _find_sheet_name(master, ["Subcategorias"])
    volumetria_name = _find_sheet_name(master, ["volumetria e fabricantes"])
    vendas_alvo_name = _find_sheet_name(master, ["Vendas Alvo"], required=False)
    vendas_pamplona_name = _find_sheet_name(master, ["Vendas Pamplona"], required=False)
    caixaria_name = _find_sheet_name(master, ["Caixaria"], required=False)
    caixaria_nova_name = _find_sheet_name(master, ["Caixaria nova compras"], required=False)
    vol_sec_name = _find_sheet_name(master, ["Volumes secundários", "Volumes secundarios"], required=False)
    vol_eq_name = _find_sheet_name(master, ["Volumetria_Equipamentos"])
    config_name = _find_sheet_name(master, ["Configuracoes_Operacionais"])
    dic_cat_name = _find_sheet_name(master, ["Dicionario_Categorias"], required=False)
    barcode_name = _find_sheet_name(master, ["Codigos de barras", "Código de barras produtos"], required=False)

    df_degelo = _normalize_columns(_safe_df(master.read_values(degelo_name)))
    df_categoria_gpt = _normalize_columns(_safe_df(master.read_values(categoria_gpt_name)))
    df_categoria_site = _normalize_columns(_safe_df(master.read_values(categoria_site_name)))
    df_subcat = _normalize_columns(_safe_df(master.read_values(subcategorias_name)))
    df_vol = _normalize_columns(_safe_df(master.read_values(volumetria_name)))
    df_vendas_alvo = _normalize_columns(_safe_df(master.read_values(vendas_alvo_name))) if vendas_alvo_name else pd.DataFrame()
    df_vendas_pam = (
        _normalize_columns(_safe_df(master.read_values(vendas_pamplona_name))) if vendas_pamplona_name else pd.DataFrame()
    )
    df_caixaria = _normalize_columns(_safe_df(master.read_values(caixaria_name))) if caixaria_name else pd.DataFrame()
    values_caixaria_nova = master.read_values(caixaria_nova_name) if caixaria_nova_name else []
    df_vol_sec = _normalize_columns(_safe_df(master.read_values(vol_sec_name))) if vol_sec_name else pd.DataFrame()
    df_vol_eq = _normalize_columns(_safe_df(master.read_values(vol_eq_name)))
    df_config = _normalize_columns(_safe_df(master.read_values(config_name)))
    df_dic_cat = _normalize_columns(_safe_df(master.read_values(dic_cat_name))) if dic_cat_name else pd.DataFrame()
    df_barcode = _normalize_columns(_safe_df(master.read_values(barcode_name))) if barcode_name else pd.DataFrame()

    map_degelo = _build_map_from_df(
        df_degelo,
        ["product_code", "cod_produto", "codigo_produto"],
        ["is_fragil", "degelo", "prioridade_alocacao", "categoria_armazenagem", "nm_fabricante", "peso_kg_unitario"],
    )
    map_categoria_gpt = _build_map_from_df(
        df_categoria_gpt,
        ["Cod_Produto", "cod_produto", "product_code"],
        ["Categoria_Correta"],
    )
    map_categoria_site = _build_map_from_df(df_categoria_site, ["cod_produto", "product_code"], ["categoria"])
    map_subcat = _build_map_from_df(df_subcat, ["product_code", "cod_produto"], ["subcategoria"])
    map_vol = _build_map_from_df(
        df_vol,
        ["cod_produto", "product_code"],
        ["nm_fabricante", "largura_cm", "altura_cm", "comprimento_cm", "volume_cm3"],
    )
    map_vol_sec = _build_map_from_df(
        df_vol_sec,
        ["cod_produto", "product_code"],
        ["caixa_largura_cm", "caixa_altura_cm", "caixa_comprimento_cm", "caixa_volume_cm3"],
    )

    vendas_df = df_vendas_alvo if not df_vendas_alvo.empty else df_vendas_pam
    sales_by_code, sales_by_name = _extract_sales_map(vendas_df)
    caixaria_map = _extract_caixaria_map(df_caixaria, values_caixaria_nova)
    barcode_codes = _extract_barcode_set(df_barcode)
    limite_peso_kg = _extract_limite_peso(df_config)
    capacity_map = _extract_capacity_map(df_vol_eq)
    dic_cat_map = _extract_category_group_map(df_dic_cat)
    subcategory_group_map = _extract_subcategory_group_map(map_subcat, map_categoria_site, dic_cat_map)

    duplicated_codes = _extract_duplicated_codes(mix_df)

    records: list[dict[str, Any]] = []
    for _, base in mix_df.iterrows():
        code = _norm_code(base.get("product_code"))
        name = str(base.get("product_name") or "").strip()
        qtd = _to_int(base.get("quantidade"), 0)

        degelo_data = map_degelo.get(code, {})
        vol_data = map_vol.get(code, {})
        site_data = map_categoria_site.get(code, {})
        gpt_data = map_categoria_gpt.get(code, {})
        subcat_data = map_subcat.get(code, {})
        vol_sec_data = map_vol_sec.get(code, {})

        categoria_armz = str(gpt_data.get("Categoria_Correta") or "").strip()
        categoria_site = str(site_data.get("categoria") or "").strip()
        subcategoria = str(subcat_data.get("subcategoria") or "").strip()
        grupo = dic_cat_map.get(_norm(categoria_site), "") or subcategory_group_map.get(_norm(subcategoria), "") or "neutro"
        fabricante = str(degelo_data.get("nm_fabricante") or vol_data.get("nm_fabricante") or "").strip()

        largura_cm = _to_float(vol_data.get("largura_cm"), 0.0)
        altura_cm = _to_float(vol_data.get("altura_cm"), 0.0)
        comprimento_cm = _to_float(vol_data.get("comprimento_cm"), 0.0)
        volume_cm3 = _to_float_cm3(vol_data.get("volume_cm3"), 0.0)
        volume_cm3_by_dims = largura_cm * altura_cm * comprimento_cm if largura_cm > 0 and altura_cm > 0 and comprimento_cm > 0 else 0.0
        if volume_cm3 <= 0 and volume_cm3_by_dims > 0:
            volume_cm3 = volume_cm3_by_dims
        elif volume_cm3 > 0 and volume_cm3_by_dims > 0:
            ratio = max(volume_cm3, volume_cm3_by_dims) / max(min(volume_cm3, volume_cm3_by_dims), 1e-9)
            if ratio >= 10:
                volume_cm3 = volume_cm3_by_dims
        vol_l_unitario = volume_cm3 / 1000.0 if volume_cm3 > 0 else 0.0

        venda_total = sales_by_code.get(code)
        if venda_total is None:
            venda_total = sales_by_name.get(name.upper(), 0.0)

        degelo = str(degelo_data.get("degelo") or "").strip().upper()
        is_fragil = str(degelo_data.get("is_fragil") or "").strip().upper()
        prioridade = str(degelo_data.get("prioridade_alocacao") or "").strip()
        tipo_equip_base = _tipo_equipamento_base(categoria_armz, degelo)
        caixaria = _to_float(caixaria_map.get(code), 0.0)
        usa_caixaria = caixaria > 1
        caixa_largura_cm = _to_float(vol_sec_data.get("caixa_largura_cm"), 0.0)
        caixa_altura_cm = _to_float(vol_sec_data.get("caixa_altura_cm"), 0.0)
        caixa_comprimento_cm = _to_float(vol_sec_data.get("caixa_comprimento_cm"), 0.0)
        caixa_volume_cm3 = _to_float_cm3(vol_sec_data.get("caixa_volume_cm3"), 0.0)
        if caixa_volume_cm3 <= 0 and caixa_largura_cm > 0 and caixa_altura_cm > 0 and caixa_comprimento_cm > 0:
            caixa_volume_cm3 = caixa_largura_cm * caixa_altura_cm * caixa_comprimento_cm
        elif caixa_volume_cm3 > 0 and caixa_largura_cm > 0 and caixa_altura_cm > 0 and caixa_comprimento_cm > 0:
            caixa_volume_cm3_by_dims = caixa_largura_cm * caixa_altura_cm * caixa_comprimento_cm
            ratio_caixa = max(caixa_volume_cm3, caixa_volume_cm3_by_dims) / max(min(caixa_volume_cm3, caixa_volume_cm3_by_dims), 1e-9)
            if ratio_caixa >= 10:
                caixa_volume_cm3 = caixa_volume_cm3_by_dims

        dados_caixa_completos = caixa_volume_cm3 > 0
        qtd_em_caixas = (qtd / caixaria) if (usa_caixaria and qtd > 0) else 0.0
        caixas_necessarias = max(1, int(math.floor(qtd_em_caixas + 0.5))) if qtd_em_caixas > 0 else 0
        caixa_volume_cm3_final = caixa_volume_cm3 if (dados_caixa_completos and caixas_necessarias > 0) else 0.0

        peso_kg_unit = _to_float(degelo_data.get("peso_kg_unitario"), 0.0)
        if peso_kg_unit <= 0:
            peso_kg_unit = _extract_weight_from_name(name)
        peso_kg_total = peso_kg_unit * qtd
        is_pesado = peso_kg_unit >= limite_peso_kg

        vol_l_total_unitario = vol_l_unitario * qtd
        vol_l_total_caixa = (caixa_volume_cm3_final * caixas_necessarias) / 1000.0 if caixa_volume_cm3_final > 0 else 0.0
        permite_metodo_caixa = tipo_equip_base == "prateleira"
        if usa_caixaria and dados_caixa_completos and qtd > 0 and permite_metodo_caixa:
            if vol_l_total_unitario > 0:
                usa_metodo_caixa = vol_l_total_caixa >= vol_l_total_unitario
            else:
                usa_metodo_caixa = vol_l_total_caixa > 0
        else:
            usa_metodo_caixa = False

        if usa_metodo_caixa and vol_l_total_caixa > 0:
            vol_l_total = vol_l_total_caixa
            metodo = "caixa"
        else:
            vol_l_total = vol_l_total_unitario if vol_l_total_unitario > 0 else vol_l_total_caixa
            metodo = "unitario"
        capacidade_bin = capacity_map.get(tipo_equip_base, 0.0)
        if vol_l_total > 0 and capacidade_bin > 0:
            escaninhos_necessarios = int(math.ceil(vol_l_total / capacidade_bin))
        else:
            escaninhos_necessarios = 1 if qtd > 0 else 0
        categoria_armz_norm = _norm(categoria_armz)
        is_geladeira_pode = ("geladeira" in categoria_armz_norm) and degelo.startswith("PODE")
        if tipo_equip_base == "geladeira_alta" and is_geladeira_pode:
            escaninhos_necessarios = min(escaninhos_necessarios, 5)
        if tipo_equip_base == "prateleira":
            escaninhos_necessarios = min(escaninhos_necessarios, 7)
        escaninhos_necessarios = max(escaninhos_necessarios, 1 if qtd > 0 else 0)

        record = {
            "product_code": code,
            "product_name": name,
            "nm_fabricante": fabricante,
            "categoria_armazenagem": categoria_armz,
            "subcategoria": subcategoria,
            "categoria_site": categoria_site,
            "grupo": grupo,
            "altura_cm": round(altura_cm, 2) if altura_cm else "",
            "vol_L_unitario": round(vol_l_unitario, 4) if vol_l_unitario else "",
            "quantidade": qtd,
            "curva": "",
            "largura_cm": round(largura_cm, 2) if largura_cm else "",
            "comprimento_cm": round(comprimento_cm, 2) if comprimento_cm else "",
            "vol_L_total": round(vol_l_total, 4) if vol_l_total else "",
            "venda_total": round(float(venda_total or 0.0), 2),
            "venda_media_diaria": round(float(venda_total or 0.0) / 30.0, 2) if venda_total else 0.0,
            "dias_estoque": round((qtd / (float(venda_total) / 30.0)), 2) if venda_total else 0.0,
            "is_fragil": is_fragil,
            "degelo": degelo,
            "prioridade_alocacao": prioridade,
            "escaninhos_necessarios": escaninhos_necessarios,
            "tipo_equipamento_base": tipo_equip_base,
            "escaninhos_necessarios_freezer": escaninhos_necessarios if tipo_equip_base == "freezer" else 0,
            "escaninhos_necessarios_geladeira": escaninhos_necessarios if tipo_equip_base == "geladeira" else 0,
            "escaninhos_necessarios_geladeira_alta": escaninhos_necessarios
            if tipo_equip_base == "geladeira_alta"
            else 0,
            "escaninhos_necessarios_prateleira": escaninhos_necessarios if tipo_equip_base == "prateleira" else 0,
            "escaninhos_necessarios_prateleira_lateral": escaninhos_necessarios
            if tipo_equip_base == "prateleira_lateral"
            else 0,
            "peso_kg_unitario": round(peso_kg_unit, 4) if peso_kg_unit else 0.0,
            "peso_kg_total": round(peso_kg_total, 4) if peso_kg_total else 0.0,
            "is_pesado": bool(is_pesado),
            "caixaria": caixaria if caixaria > 0 else "",
            "qtd_em_caixas": round(qtd_em_caixas, 3) if qtd_em_caixas > 0 else "",
            "metodo": metodo,
            "caixa_volume_cm3_final": round(caixa_volume_cm3_final, 2) if caixa_volume_cm3_final > 0 else "",
            "caixas_necessarias": caixas_necessarias if caixas_necessarias > 0 else "",
        }
        records.append(record)

    if not records:
        return {"success": False, "error": "Nenhum produto válido no mix."}

    df_out = pd.DataFrame(records)
    if not df_out.empty:
        df_curve = df_out[["product_code", "venda_total"]].copy()
        df_curve["venda_total"] = pd.to_numeric(df_curve["venda_total"], errors="coerce").fillna(0.0)
        df_curve = df_curve.sort_values(by="venda_total", ascending=False)
        total_sales = float(df_curve["venda_total"].sum())
        curve_map: dict[str, str] = {}
        if total_sales > 0:
            running = 0.0
            for _, row in df_curve.iterrows():
                code = _norm_code(row.get("product_code"))
                val = float(row.get("venda_total") or 0.0)
                if val <= 0:
                    continue
                running += val
                acc = running / total_sales
                if acc < 0.8:
                    curve_map[code] = "A"
                elif acc < 0.95:
                    curve_map[code] = "B"
                else:
                    curve_map[code] = "C"
        df_out["curva"] = df_out.apply(
            lambda row: "D"
            if float(row.get("venda_total") or 0.0) <= 0
            else curve_map.get(_norm_code(row.get("product_code")), "C"),
            axis=1,
        )

    target.ensure_sheet(SHEET_BASE_PRODUTOS)
    base_values = target.read_values(SHEET_BASE_PRODUTOS)
    if base_values and len(base_values) > 0 and any(str(h or "").strip() for h in base_values[0]):
        target_headers = [str(h or "").strip() for h in base_values[0]]
    else:
        target_headers = BASE_OUTPUT_HEADERS
    target_headers = _ensure_output_headers(target_headers)

    existing_row_by_code: dict[str, list[Any]] = {}
    existing_code_idx = _find_header_index(target_headers, ["product_code", "produto_alocado_code"])
    if existing_code_idx != -1 and base_values:
        for row in base_values[1:]:
            padded = list(row) + [""] * (len(target_headers) - len(row))
            code = _norm_code(padded[existing_code_idx] if existing_code_idx < len(padded) else "")
            if not code:
                continue
            existing_row_by_code[code] = padded[: len(target_headers)]

    # Aba pode não existir na primeira vez — trata como plano vazio (nenhum código alocado para preservar)
    plano_values = target.read_values(SHEET_PLANO_FINAL) if SHEET_PLANO_FINAL in target.list_sheet_names() else []
    allocated_codes = _extract_allocated_codes_from_plano_values(plano_values)

    rows: list[list[Any]] = [target_headers]
    output_codes: set[str] = set()
    frozen_rows_count = 0
    for _, row in df_out.iterrows():
        code = _norm_code(row.get("product_code"))
        if code in allocated_codes and code in existing_row_by_code:
            rows.append(_merge_preserved_allocated_row(existing_row_by_code[code], row.to_dict(), target_headers))
            frozen_rows_count += 1
        else:
            rows.append(_row_from_record(row.to_dict(), target_headers))
        if code:
            output_codes.add(code)

    # Apply manual overrides (Edicoes_Manuais) — user edits via pencil icon survive ETL re-runs.
    manual_overrides = _read_manual_overrides(target)
    if manual_overrides:
        header_idx = {h: i for i, h in enumerate(target_headers)}
        code_col = header_idx.get("product_code", -1)
        for row_idx in range(1, len(rows)):
            row = rows[row_idx]
            code = _norm_code(row[code_col]) if code_col != -1 and code_col < len(row) else ""
            if not code or code not in manual_overrides:
                continue
            for field, value in manual_overrides[code].items():
                col = header_idx.get(field)
                if col is not None and col < len(row):
                    row[col] = value

    # ── Cap final de escaninhos (aplica em TODAS as linhas, independente do caminho) ──
    _apply_escaninhos_cap(rows, target_headers)

    df_warnings = _safe_df(rows)
    df_warnings = _normalize_columns(df_warnings)
    warnings = _build_etl_warnings(df_warnings, duplicated_codes=duplicated_codes, barcode_codes=barcode_codes)

    target.clear_sheet(SHEET_BASE_PRODUTOS)
    target.append_rows(SHEET_BASE_PRODUTOS, rows)
    plan_cleanup = _prune_plan_and_versions_to_valid_codes(target, output_codes)

    return {
        "success": True,
        "rows_written": max(0, len(rows) - 1),
        "rows_frozen_allocated": frozen_rows_count,
        "allocated_codes_total": len(allocated_codes),
        "zero_qty_codes_removed": len(zero_qty_codes),
        "removed_plan_allocations": plan_cleanup["removed_plan_allocations"],
        "cleaned_plan_sheets": plan_cleanup["cleaned_plan_sheets"],
        "warnings": warnings,
        "limite_peso_kg": limite_peso_kg,
        "master_sheet_title": master.get_title(),
        "mix_sheet_title": mix.get_title(),
        "target_sheet_title": target.get_title(),
        "sheet_url": target.get_sheet_url(SHEET_BASE_PRODUTOS),
        "links": {
            "base_produtos": target.get_sheet_url(SHEET_BASE_PRODUTOS),
            "master_volumetria": master.get_sheet_url(volumetria_name),
            "master_subcategorias": master.get_sheet_url(subcategorias_name),
            "master_categoria_site": master.get_sheet_url(categoria_site_name),
            "master_degelo": master.get_sheet_url(degelo_name),
        },
    }


def _ensure_output_headers(headers: list[str]) -> list[str]:
    output = [str(header or "").strip() for header in headers]
    normalized = {_norm(header) for header in output}
    for required in BASE_OUTPUT_HEADERS:
        if _norm(required) not in normalized:
            output.append(required)
            normalized.add(_norm(required))
    return output
