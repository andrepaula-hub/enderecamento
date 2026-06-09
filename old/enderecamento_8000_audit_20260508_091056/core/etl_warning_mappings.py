from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from .gsheets_client import GSheetsClient
from .utils import normalize_string, parse_number

SHEET_LOG_INPUTS = "Log_Inputs_ETL"
SHEET_BASE_PRODUTOS = "Base_Produtos"


def _norm(value: Any) -> str:
    return normalize_string(value).strip().lower().replace(" ", "_")


def _norm_code(value: Any) -> str:
    return normalize_string(value).strip().upper()


def _find_sheet_name(client: GSheetsClient, candidates: list[str], required: bool = True) -> str | None:
    names = client.list_sheet_names()
    norm_map = {_norm(name): name for name in names}
    for candidate in candidates:
        found = norm_map.get(_norm(candidate))
        if found:
            return found
    if required:
        raise ValueError(f"Aba obrigatória não encontrada: {', '.join(candidates)}")
    return None


def _find_col_index(headers: list[str], candidates: list[str]) -> int:
    norm_headers = [_norm(h) for h in headers]
    for candidate in candidates:
        needle = _norm(candidate)
        if needle in norm_headers:
            return norm_headers.index(needle)
    return -1


def _ensure_column(headers: list[str], candidates: list[str], canonical_name: str) -> tuple[int, bool]:
    idx = _find_col_index(headers, candidates)
    if idx >= 0:
        return idx, False
    headers.append(canonical_name)
    return len(headers) - 1, True


def _safe_to_float(value: Any) -> float | None:
    parsed = parse_number(value)
    if parsed is None:
        return None
    try:
        return float(parsed)
    except Exception:
        return None


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _changed(old: Any, new: Any) -> bool:
    return _stringify(old).strip() != _stringify(new).strip()


def _load_table(client: GSheetsClient, sheet_name: str, default_headers: list[str]) -> tuple[list[str], list[list[Any]]]:
    values = client.read_values(sheet_name)
    if values and len(values) > 0 and any(str(v or "").strip() for v in values[0]):
        headers = [str(v or "").strip() for v in values[0]]
        rows = [row + [None] * (len(headers) - len(row)) for row in values[1:]]
        return headers, rows
    headers = default_headers[:]
    client.clear_sheet(sheet_name)
    client.append_rows(sheet_name, [headers])
    return headers, []


def _apply_updates(
    client: GSheetsClient,
    sheet_name: str,
    headers: list[str],
    row_updates: dict[int, list[Any]],
    rows_to_append: list[list[Any]],
    header_changed: bool,
) -> None:
    if header_changed:
        client.update_header(sheet_name, headers)
    if row_updates:
        client.update_rows(sheet_name, row_updates, len(headers))
    if rows_to_append:
        client.append_rows(sheet_name, rows_to_append)


def _append_log_rows(client: GSheetsClient, rows: list[list[Any]]) -> None:
    if not rows:
        return
    client.ensure_sheet(SHEET_LOG_INPUTS)
    values = client.read_values(SHEET_LOG_INPUTS)
    headers = [
        "data_hora",
        "tipo_alerta",
        "aba_destino",
        "product_code",
        "product_name",
        "campo",
        "valor_anterior",
        "valor_novo",
        "aba_link",
    ]
    if not values:
        client.append_rows(SHEET_LOG_INPUTS, [headers])
    client.append_rows(SHEET_LOG_INPUTS, rows)


def get_etl_mapping_options(master_sheet_id: str) -> dict[str, Any]:
    client = GSheetsClient(master_sheet_id)

    subcategorias: list[str] = []
    categorias_site: list[str] = []

    sub_sheet = _find_sheet_name(client, ["Subcategorias"], required=False)
    if sub_sheet:
        sub_data = client.read_sheet(sub_sheet)
        seen_sub: set[str] = set()
        for row in sub_data:
            sub = normalize_string(row.get("subcategoria"))
            if not sub:
                continue
            key = sub.lower()
            if key in seen_sub:
                continue
            seen_sub.add(key)
            subcategorias.append(sub)

    cat_site_sheet = _find_sheet_name(client, ["Categoria Site"], required=False)
    if cat_site_sheet:
        cat_data = client.read_sheet(cat_site_sheet)
        seen_cat: set[str] = set()
        for row in cat_data:
            cat = normalize_string(row.get("categoria"))
            if not cat:
                continue
            key = cat.lower()
            if key in seen_cat:
                continue
            seen_cat.add(key)
            categorias_site.append(cat)

    dic_sheet = _find_sheet_name(client, ["Dicionario_Categorias"], required=False)
    if dic_sheet:
        dic_data = client.read_sheet(dic_sheet)
        seen = {c.lower() for c in categorias_site}
        for row in dic_data:
            cat = normalize_string(row.get("categoria_site"))
            if not cat:
                continue
            key = cat.lower()
            if key in seen:
                continue
            seen.add(key)
            categorias_site.append(cat)

    return {
        "success": True,
        "options": {
            "subcategoria": sorted(subcategorias),
            "categoria_site": sorted(categorias_site),
            "degelo": ["PODE", "NAO"],
        },
    }


def save_etl_warning_mappings(master_sheet_id: str, warning_type: str, updates: list[dict[str, Any]]) -> dict[str, Any]:
    client = GSheetsClient(master_sheet_id)
    warning_norm = _norm(warning_type)
    payload = [u for u in (updates or []) if isinstance(u, dict)]
    if not payload:
        return {"success": False, "error": "Nenhuma atualização recebida."}

    now_str = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m-%d %H:%M:%S")
    logs: list[list[Any]] = []
    updated_count = 0
    inserted_count = 0
    target_sheet = ""

    if warning_norm == "volumetria_vazia":
        target_sheet = _find_sheet_name(client, ["volumetria e fabricantes"])
        headers, rows = _load_table(
            client,
            target_sheet,
            ["cod_produto", "nm_fabricante", "largura_cm", "altura_cm", "comprimento_cm", "volume_cm3"],
        )

        code_idx, changed_code = _ensure_column(headers, ["cod_produto", "product_code"], "cod_produto")
        fab_idx, changed_fab = _ensure_column(headers, ["nm_fabricante"], "nm_fabricante")
        larg_idx, changed_larg = _ensure_column(headers, ["largura_cm"], "largura_cm")
        alt_idx, changed_alt = _ensure_column(headers, ["altura_cm"], "altura_cm")
        comp_idx, changed_comp = _ensure_column(headers, ["comprimento_cm"], "comprimento_cm")
        vol_idx, changed_vol = _ensure_column(headers, ["volume_cm3"], "volume_cm3")
        header_changed = any([changed_code, changed_fab, changed_larg, changed_alt, changed_comp, changed_vol])

        code_to_row: dict[str, int] = {}
        for idx, row in enumerate(rows):
            code = _norm_code(row[code_idx] if code_idx < len(row) else "")
            if code and code not in code_to_row:
                code_to_row[code] = idx

        row_updates: dict[int, list[Any]] = {}
        rows_to_append: list[list[Any]] = []
        target_link = client.get_sheet_url(target_sheet)

        for item in payload:
            code = _norm_code(item.get("product_code"))
            if not code:
                continue

            largura = _safe_to_float(item.get("largura_cm"))
            altura = _safe_to_float(item.get("altura_cm"))
            comprimento = _safe_to_float(item.get("comprimento_cm"))
            volume_cm3 = _safe_to_float(item.get("volume_cm3"))
            if largura and altura and comprimento and largura > 0 and altura > 0 and comprimento > 0:
                volume_cm3 = largura * altura * comprimento
            if not volume_cm3:
                continue

            row_idx = code_to_row.get(code)
            product_name = normalize_string(item.get("product_name"))

            if row_idx is None:
                row = [None] * len(headers)
                row[code_idx] = code
                row[fab_idx] = item.get("nm_fabricante") or ""
                row[larg_idx] = largura or ""
                row[alt_idx] = altura or ""
                row[comp_idx] = comprimento or ""
                row[vol_idx] = round(volume_cm3, 2)
                rows_to_append.append(row)
                inserted_count += 1
                logs.extend(
                    [
                        [now_str, warning_type, target_sheet, code, product_name, "largura_cm", "", row[larg_idx], target_link],
                        [now_str, warning_type, target_sheet, code, product_name, "altura_cm", "", row[alt_idx], target_link],
                        [now_str, warning_type, target_sheet, code, product_name, "comprimento_cm", "", row[comp_idx], target_link],
                        [now_str, warning_type, target_sheet, code, product_name, "volume_cm3", "", row[vol_idx], target_link],
                    ]
                )
                continue

            current = rows[row_idx][:]
            while len(current) < len(headers):
                current.append(None)
            before_l = current[larg_idx]
            before_a = current[alt_idx]
            before_c = current[comp_idx]
            before_v = current[vol_idx]

            current[larg_idx] = largura or current[larg_idx]
            current[alt_idx] = altura or current[alt_idx]
            current[comp_idx] = comprimento or current[comp_idx]
            current[vol_idx] = round(volume_cm3, 2)
            row_updates[row_idx + 2] = current
            updated_count += 1

            if _changed(before_l, current[larg_idx]):
                logs.append([now_str, warning_type, target_sheet, code, product_name, "largura_cm", before_l, current[larg_idx], target_link])
            if _changed(before_a, current[alt_idx]):
                logs.append([now_str, warning_type, target_sheet, code, product_name, "altura_cm", before_a, current[alt_idx], target_link])
            if _changed(before_c, current[comp_idx]):
                logs.append([now_str, warning_type, target_sheet, code, product_name, "comprimento_cm", before_c, current[comp_idx], target_link])
            if _changed(before_v, current[vol_idx]):
                logs.append([now_str, warning_type, target_sheet, code, product_name, "volume_cm3", before_v, current[vol_idx], target_link])

        _apply_updates(client, target_sheet, headers, row_updates, rows_to_append, header_changed)

    elif warning_norm in {"subcategoria_vazia", "categoria_site_vazia", "degelo_geladeira_vazio"}:
        if warning_norm == "subcategoria_vazia":
            target_sheet = _find_sheet_name(client, ["Subcategorias"])
            default_headers = ["subcategoria", "sku_id", "product_code", "description"]
            target_col_name = "subcategoria"
            target_candidates = ["subcategoria"]
            code_candidates = ["product_code", "cod_produto", "sku_id"]
            add_desc = True
        elif warning_norm == "categoria_site_vazia":
            target_sheet = _find_sheet_name(client, ["Categoria Site"])
            default_headers = ["cod_produto", "categoria"]
            target_col_name = "categoria"
            target_candidates = ["categoria"]
            code_candidates = ["cod_produto", "product_code"]
            add_desc = False
        else:
            target_sheet = _find_sheet_name(client, ["Degelo"])
            default_headers = ["product_code", "product_name", "degelo"]
            target_col_name = "degelo"
            target_candidates = ["degelo"]
            code_candidates = ["product_code", "cod_produto"]
            add_desc = True

        headers, rows = _load_table(client, target_sheet, default_headers)
        code_idx, changed_code = _ensure_column(headers, code_candidates, code_candidates[0])
        target_idx, changed_target = _ensure_column(headers, target_candidates, target_col_name)
        header_changed = changed_code or changed_target
        desc_idx = -1
        if add_desc:
            desc_idx, changed_desc = _ensure_column(headers, ["product_name", "description", "desc_produto"], "product_name")
            header_changed = header_changed or changed_desc

        code_to_row: dict[str, int] = {}
        for idx, row in enumerate(rows):
            code = _norm_code(row[code_idx] if code_idx < len(row) else "")
            if code and code not in code_to_row:
                code_to_row[code] = idx

        row_updates: dict[int, list[Any]] = {}
        rows_to_append: list[list[Any]] = []
        target_link = client.get_sheet_url(target_sheet)

        for item in payload:
            code = _norm_code(item.get("product_code"))
            if not code:
                continue

            if warning_norm == "subcategoria_vazia":
                new_value = normalize_string(item.get("subcategoria"))
            elif warning_norm == "categoria_site_vazia":
                new_value = normalize_string(item.get("categoria_site"))
            else:
                new_value = normalize_string(item.get("degelo")).upper().replace("NÃO", "NAO")

            if not new_value:
                continue

            row_idx = code_to_row.get(code)
            product_name = normalize_string(item.get("product_name"))

            if row_idx is None:
                row = [None] * len(headers)
                row[code_idx] = code
                row[target_idx] = new_value
                if desc_idx >= 0:
                    row[desc_idx] = product_name
                rows_to_append.append(row)
                inserted_count += 1
                logs.append([now_str, warning_type, target_sheet, code, product_name, target_col_name, "", new_value, target_link])
                continue

            current = rows[row_idx][:]
            while len(current) < len(headers):
                current.append(None)
            old_value = current[target_idx]
            current[target_idx] = new_value
            if desc_idx >= 0 and not normalize_string(current[desc_idx]) and product_name:
                current[desc_idx] = product_name
            row_updates[row_idx + 2] = current
            updated_count += 1

            if _changed(old_value, new_value):
                logs.append([now_str, warning_type, target_sheet, code, product_name, target_col_name, old_value, new_value, target_link])

        _apply_updates(client, target_sheet, headers, row_updates, rows_to_append, header_changed)

    else:
        return {"success": False, "error": f"Tipo de alerta não suportado: {warning_type}"}

    _append_log_rows(client, logs)
    return {
        "success": True,
        "warning_type": warning_type,
        "target_sheet": target_sheet,
        "target_sheet_url": client.get_sheet_url(target_sheet) if target_sheet else "",
        "log_sheet": SHEET_LOG_INPUTS,
        "log_sheet_url": client.get_sheet_url(SHEET_LOG_INPUTS),
        "updated_count": updated_count,
        "inserted_count": inserted_count,
        "log_count": len(logs),
    }


def _read_base_rows(target_client: GSheetsClient) -> list[dict[str, Any]]:
    values = target_client.read_values(SHEET_BASE_PRODUTOS)
    if not values:
        return []
    headers = [str(v or "").strip() for v in values[0]]
    if not headers:
        return []
    rows: list[dict[str, Any]] = []
    for raw in values[1:]:
        row = raw + [None] * (len(headers) - len(raw))
        rows.append({headers[i]: row[i] for i in range(len(headers))})
    return rows


def _pick_value(row: dict[str, Any], candidates: list[str]) -> Any:
    for key in candidates:
        for row_key, row_val in row.items():
            if _norm(row_key) == _norm(key):
                return row_val
    return None


def _extract_problematic_rows(base_rows: list[dict[str, Any]], warning_type: str) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    warning_norm = _norm(warning_type)
    for row in base_rows:
        code = _norm_code(_pick_value(row, ["product_code", "cod_produto", "codigo_produto"]))
        if not code:
            continue
        name = normalize_string(_pick_value(row, ["product_name", "descricao", "desc_produto"]))
        categoria_armz = normalize_string(_pick_value(row, ["categoria_armazenagem"])).lower()
        degelo = normalize_string(_pick_value(row, ["degelo"])).upper().replace("NÃO", "NAO")
        categoria_site = normalize_string(_pick_value(row, ["categoria_site"]))
        subcategoria = normalize_string(_pick_value(row, ["subcategoria"]))
        fabricante = normalize_string(_pick_value(row, ["nm_fabricante"]))
        vol_u = parse_number(_pick_value(row, ["vol_L_unitario", "vol_l_unitario"]))

        add = False
        if warning_norm == "volumetria_vazia":
            add = (vol_u is None) or (float(vol_u) <= 0)
        elif warning_norm == "subcategoria_vazia":
            add = not subcategoria
        elif warning_norm == "categoria_site_vazia":
            add = not categoria_site
        elif warning_norm == "categoria_armz_vazia":
            add = not categoria_armz
        elif warning_norm == "degelo_geladeira_vazio":
            add = (("geladeira" in categoria_armz) or ("refrigerado" in categoria_armz)) and (not degelo)

        if add:
            output.append(
                {
                    "product_code": code,
                    "product_name": name,
                    "categoria_armazenagem": categoria_armz,
                    "categoria_site": categoria_site,
                    "subcategoria": subcategoria,
                    "degelo": degelo,
                    "nm_fabricante": fabricante,
                }
            )
    return output


def _upsert_group_rows(
    master_client: GSheetsClient,
    warning_type: str,
    problematic_rows: list[dict[str, Any]],
    default_volume_cm3: float | None = None,
) -> tuple[str, int, int, int, int, str]:
    warning_norm = _norm(warning_type)
    queued_count = 0
    inserted_count = 0
    unchanged_count = 0
    highlighted_rows: list[int] = []
    highlight_error = ""
    logs: list[list[Any]] = []
    now_str = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y-%m-%d %H:%M:%S")

    if warning_norm == "volumetria_vazia":
        target_sheet = _find_sheet_name(master_client, ["volumetria e fabricantes"])
        headers, rows = _load_table(
            master_client,
            target_sheet,
            ["cod_produto", "nm_fabricante", "largura_cm", "altura_cm", "comprimento_cm", "volume_cm3"],
        )
        code_idx, c1 = _ensure_column(headers, ["cod_produto", "product_code"], "cod_produto")
        fab_idx, c2 = _ensure_column(headers, ["nm_fabricante"], "nm_fabricante")
        larg_idx, c3 = _ensure_column(headers, ["largura_cm"], "largura_cm")
        alt_idx, c4 = _ensure_column(headers, ["altura_cm"], "altura_cm")
        comp_idx, c5 = _ensure_column(headers, ["comprimento_cm"], "comprimento_cm")
        vol_idx, c6 = _ensure_column(headers, ["volume_cm3"], "volume_cm3")
        header_changed = any([c1, c2, c3, c4, c5, c6])
        key_field = "volume_cm3"
    elif warning_norm == "subcategoria_vazia":
        target_sheet = _find_sheet_name(master_client, ["Subcategorias"])
        headers, rows = _load_table(master_client, target_sheet, ["subcategoria", "sku_id", "product_code", "description"])
        code_idx, c1 = _ensure_column(headers, ["product_code", "cod_produto", "sku_id"], "product_code")
        sub_idx, c2 = _ensure_column(headers, ["subcategoria"], "subcategoria")
        sku_idx, c3 = _ensure_column(headers, ["sku_id"], "sku_id")
        desc_idx, c4 = _ensure_column(headers, ["description", "product_name", "desc_produto"], "description")
        fab_idx = -1
        larg_idx = alt_idx = comp_idx = vol_idx = -1
        header_changed = any([c1, c2, c3, c4])
        key_field = "subcategoria"
    elif warning_norm == "categoria_site_vazia":
        target_sheet = _find_sheet_name(master_client, ["Categoria Site"])
        headers, rows = _load_table(master_client, target_sheet, ["cod_produto", "categoria"])
        code_idx, c1 = _ensure_column(headers, ["cod_produto", "product_code"], "cod_produto")
        cat_idx, c2 = _ensure_column(headers, ["categoria", "categoria_site"], "categoria")
        sub_idx = sku_idx = desc_idx = -1
        fab_idx = -1
        larg_idx = alt_idx = comp_idx = vol_idx = -1
        header_changed = any([c1, c2])
        key_field = "categoria"
    elif warning_norm == "categoria_armz_vazia":
        target_sheet = _find_sheet_name(master_client, ["Categoria ChatGPT"])
        headers, rows = _load_table(
            master_client,
            target_sheet,
            ["Cod_Produto", "Desc_Produto", "Categoria", "Armazenamento", "Categoria_Correta"],
        )
        code_idx, c1 = _ensure_column(headers, ["Cod_Produto", "cod_produto", "product_code"], "Cod_Produto")
        desc_gpt_idx, c2 = _ensure_column(headers, ["Desc_Produto", "description", "product_name"], "Desc_Produto")
        cat_corr_idx, c3 = _ensure_column(headers, ["Categoria_Correta", "categoria_correta"], "Categoria_Correta")
        sub_idx = sku_idx = desc_idx = -1
        fab_idx = -1
        larg_idx = alt_idx = comp_idx = vol_idx = -1
        header_changed = any([c1, c2, c3])
        key_field = "Categoria_Correta"
    else:
        target_sheet = _find_sheet_name(master_client, ["Degelo"])
        headers, rows = _load_table(
            master_client,
            target_sheet,
            ["product_code", "product_name", "is_fragil", "degelo", "prioridade_alocacao", "categoria_armazenagem"],
        )
        code_idx, c1 = _ensure_column(headers, ["product_code", "cod_produto"], "product_code")
        name_idx, c2 = _ensure_column(headers, ["product_name", "desc_produto", "description"], "product_name")
        degelo_idx, c3 = _ensure_column(headers, ["degelo"], "degelo")
        cat_armz_idx, c4 = _ensure_column(headers, ["categoria_armazenagem"], "categoria_armazenagem")
        sub_idx = sku_idx = desc_idx = -1
        fab_idx = -1
        larg_idx = alt_idx = comp_idx = vol_idx = -1
        header_changed = any([c1, c2, c3, c4])
        key_field = "degelo" if warning_norm == "degelo_geladeira_vazio" else "categoria_armazenagem"

    code_map: dict[str, int] = {}
    for idx, row in enumerate(rows):
        code = _norm_code(row[code_idx] if code_idx < len(row) else "")
        if code and code not in code_map:
            code_map[code] = idx

    row_updates: dict[int, list[Any]] = {}
    rows_to_append: list[list[Any]] = []
    target_link = master_client.get_sheet_url(target_sheet)

    for item in problematic_rows:
        code = _norm_code(item.get("product_code"))
        if not code:
            continue
        product_name = normalize_string(item.get("product_name"))
        existing_idx = code_map.get(code)

        if existing_idx is None:
            row = [None] * len(headers)
            row[code_idx] = code
            if warning_norm == "volumetria_vazia":
                row[fab_idx] = item.get("nm_fabricante") or ""
                if default_volume_cm3 and default_volume_cm3 > 0:
                    row[vol_idx] = round(default_volume_cm3, 2)
            elif warning_norm == "subcategoria_vazia":
                row[sku_idx] = code
                row[desc_idx] = product_name
            elif warning_norm == "categoria_site_vazia":
                pass
            elif warning_norm == "categoria_armz_vazia":
                row[desc_gpt_idx] = product_name
            else:
                row[name_idx] = product_name
            rows_to_append.append(row)
            inserted_count += 1
            queued_count += 1
            highlighted_rows.append(len(rows) + 1 + len(rows_to_append))
            log_new_value = row[vol_idx] if warning_norm == "volumetria_vazia" and vol_idx >= 0 else ""
            logs.append([now_str, warning_type, target_sheet, code, product_name, key_field, "", log_new_value, target_link])
            continue

        current = rows[existing_idx][:]
        while len(current) < len(headers):
            current.append(None)
        changed = False
        if warning_norm == "volumetria_vazia":
            if not normalize_string(current[fab_idx]) and item.get("nm_fabricante"):
                current[fab_idx] = item.get("nm_fabricante")
                changed = True
            if default_volume_cm3 and default_volume_cm3 > 0:
                current_volume = _safe_to_float(current[vol_idx] if vol_idx < len(current) else None)
                if (current_volume is None) or (current_volume <= 0):
                    current[vol_idx] = round(default_volume_cm3, 2)
                    changed = True
        elif warning_norm == "subcategoria_vazia":
            if not normalize_string(current[sku_idx]):
                current[sku_idx] = code
                changed = True
            if not normalize_string(current[desc_idx]) and product_name:
                current[desc_idx] = product_name
                changed = True
        elif warning_norm == "categoria_armz_vazia":
            if not normalize_string(current[desc_gpt_idx]) and product_name:
                current[desc_gpt_idx] = product_name
                changed = True
        elif warning_norm == "degelo_geladeira_vazio":
            if not normalize_string(current[name_idx]) and product_name:
                current[name_idx] = product_name
                changed = True

        if changed:
            row_updates[existing_idx + 2] = current
            queued_count += 1
            highlighted_rows.append(existing_idx + 2)
            log_new_value = current[vol_idx] if warning_norm == "volumetria_vazia" and vol_idx >= 0 else ""
            logs.append([now_str, warning_type, target_sheet, code, product_name, key_field, "", log_new_value, target_link])
        else:
            unchanged_count += 1

    _apply_updates(master_client, target_sheet, headers, row_updates, rows_to_append, header_changed)
    if highlighted_rows:
        try:
            master_client.highlight_rows(target_sheet, highlighted_rows, end_column_index=len(headers))
        except Exception as exc:
            highlight_error = str(exc)
    _append_log_rows(master_client, logs)
    return target_sheet, queued_count, inserted_count, unchanged_count, len(set(highlighted_rows)), highlight_error


def send_warning_group_to_etl(master_sheet_id: str, target_sheet_id: str, warning_type: str) -> dict[str, Any]:
    supported = {
        "volumetria_vazia",
        "subcategoria_vazia",
        "categoria_site_vazia",
        "categoria_armz_vazia",
        "degelo_geladeira_vazio",
    }
    target_field_map = {
        "volumetria_vazia": "volume_cm3",
        "subcategoria_vazia": "subcategoria",
        "categoria_site_vazia": "categoria",
        "categoria_armz_vazia": "Categoria_Correta",
        "degelo_geladeira_vazio": "degelo",
    }
    warning_norm = _norm(warning_type)
    if warning_norm not in supported:
        return {"success": False, "error": f"Tipo de alerta não suportado para envio em lote: {warning_type}"}

    master_client = GSheetsClient(master_sheet_id)
    target_client = GSheetsClient(target_sheet_id)
    base_rows = _read_base_rows(target_client)
    problematic_rows = _extract_problematic_rows(base_rows, warning_norm)

    target_sheet, queued_count, inserted_count, unchanged_count, highlighted_count, highlight_error = _upsert_group_rows(
        master_client,
        warning_norm,
        problematic_rows,
    )

    response = {
        "success": True,
        "warning_type": warning_type,
        "problematic_count": len(problematic_rows),
        "queued_count": queued_count,
        "inserted_count": inserted_count,
        "already_present_count": unchanged_count,
        "highlighted_count": highlighted_count,
        "target_field": target_field_map.get(warning_norm, ""),
        "target_sheet": target_sheet,
        "target_sheet_url": master_client.get_sheet_url(target_sheet),
        "log_sheet": SHEET_LOG_INPUTS,
        "log_sheet_url": master_client.get_sheet_url(SHEET_LOG_INPUTS),
    }
    if highlight_error:
        response["highlight_error"] = highlight_error
    return response


def send_missing_volumetria_with_default(
    master_sheet_id: str,
    target_sheet_id: str,
    default_volume_cm3: Any,
) -> dict[str, Any]:
    parsed_default = parse_number(default_volume_cm3)
    if parsed_default is None or float(parsed_default) <= 0:
        return {"success": False, "error": "Informe um volume padrão válido (> 0)."}

    master_client = GSheetsClient(master_sheet_id)
    target_client = GSheetsClient(target_sheet_id)
    base_rows = _read_base_rows(target_client)
    problematic_rows = _extract_problematic_rows(base_rows, "volumetria_vazia")

    target_sheet, queued_count, inserted_count, unchanged_count, highlighted_count, highlight_error = _upsert_group_rows(
        master_client,
        "volumetria_vazia",
        problematic_rows,
        default_volume_cm3=float(parsed_default),
    )

    response = {
        "success": True,
        "warning_type": "volumetria_vazia",
        "default_volume_cm3": round(float(parsed_default), 2),
        "problematic_count": len(problematic_rows),
        "queued_count": queued_count,
        "inserted_count": inserted_count,
        "already_present_count": unchanged_count,
        "highlighted_count": highlighted_count,
        "target_field": "volume_cm3",
        "target_sheet": target_sheet,
        "target_sheet_url": master_client.get_sheet_url(target_sheet),
        "log_sheet": SHEET_LOG_INPUTS,
        "log_sheet_url": master_client.get_sheet_url(SHEET_LOG_INPUTS),
    }
    if highlight_error:
        response["highlight_error"] = highlight_error
    return response
