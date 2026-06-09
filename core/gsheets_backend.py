from __future__ import annotations

from datetime import datetime
import time
import re
import unicodedata
from typing import Any
from zoneinfo import ZoneInfo

from .gsheets_client import GSheetsClient
from .initial_data import get_initial_data
from .barcode import get_product_by_barcode
from .reports import _build_report_dataset, generate_sku_report_custom
from .utils import normalize_string, parse_bool_flag, parse_number

PRANCHETA_ID = "PRANCHETA"
UNALLOCATED_ID = "UNALLOCATED"
LOG_UNALLOCATED_LABEL = "NÃO ALOCADO"
LOG_DATE_FORMAT = "%d/%m/%Y"
LOG_TIME_FORMAT = "%H:%M:%S"

SHEET_PLANO_FINAL = "Plano_Enderecamento_Final"
SHEET_LOG_REEND = "Log_Reenderecamento"
SHEET_LAYOUT_ATUAL = "Plano_Enderecamento_Final_Layout_Atual"
SHEET_BASE_PRODUTOS = "Base_Produtos"
SHEET_DEPARA_DEFAULT = "DePara"
SHEET_CADASTRO_NOVO = "Cadastro_Equipamentos"
SHEET_CADASTRO_ANTIGO = "Cadastro_Equipamentos_Antigo"
SHEET_VOLUMETRIA = "Volumetria_Equipamentos"
SHEET_VERSION_PREFIX = "VERSAO_ENDERECAMENTO__"
SHEET_EDICOES_MANUAIS = "Edicoes_Manuais"

DEFAULT_PLANO_HEADERS = [
    "location_id",
    "galpao_id",
    "rua_num",
    "equipamento_num",
    "tipo_equipamento",
    "nivel",
    "escaninho_num_no_nivel",
    "capacidade_l",
    "tipo_equipamento_final",
    "product_code",
    "product_name",
    "quantidade",
    "curva",
    "grupo",
    "categoria_armazenagem",
    "vol_l_unitario",
    "vol_L_unitario",
    "venda_total",
    "nm_fabricante",
    "altura_cm",
    "peso_kg_unitario",
    "subcategoria",
    "is_pesado",
    "is_alto",
    "is_hot_zone",
    "is_nivel_alto",
    "is_nivel_inferior",
    "is_realocado",
    "location_id_atual",
    "slot_duplo",
    "produto_alocado_code",
    "grupo_alocado",
]

INITIAL_DATA_CACHE_TTL_SECONDS = 120.0
_INITIAL_DATA_CACHE: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}


class GSheetSource:
    def __init__(self, client: GSheetsClient):
        self.client = client

    def read_sheet(self, name: str) -> list[dict[str, Any]]:
        return self.client.read_sheet(name)

    def read_sheets(self, names: list[str]) -> dict[str, list[dict[str, Any]]]:
        return self.client.read_sheets(names)

    def spreadsheet_title(self) -> str | None:
        return self.client.get_title()


class FallbackGSheetSource:
    def __init__(self, primary: GSheetsClient, fallback: GSheetsClient | None):
        self.primary = primary
        self.fallback = fallback

    def _aliases(self, name: str) -> list[str]:
        key = _normalize_header(name)
        if key == _normalize_header("Código de barras produtos"):
            return ["Código de barras produtos", "Codigos de barras"]
        return [name]

    def _read_from(self, client: GSheetsClient, name: str) -> list[dict[str, Any]]:
        try:
            return client.read_sheet(name)
        except Exception:
            return []

    def read_sheet(self, name: str) -> list[dict[str, Any]]:
        for candidate in self._aliases(name):
            data = self._read_from(self.primary, candidate)
            if data:
                return data
        if self.fallback:
            for candidate in self._aliases(name):
                data = self._read_from(self.fallback, candidate)
                if data:
                    return data
        return []

    def read_sheets(self, names: list[str]) -> dict[str, list[dict[str, Any]]]:
        requested = [str(name or "").strip() for name in names if str(name or "").strip()]
        if not requested:
            return {}

        primary_candidates: list[str] = []
        fallback_candidates: list[str] = []
        for name in requested:
            aliases = self._aliases(name)
            for alias in aliases:
                if alias not in primary_candidates:
                    primary_candidates.append(alias)
                if alias not in fallback_candidates:
                    fallback_candidates.append(alias)

        primary_map = self.primary.read_sheets(primary_candidates)
        fallback_map = self.fallback.read_sheets(fallback_candidates) if self.fallback else {}

        output: dict[str, list[dict[str, Any]]] = {}
        for name in requested:
            output[name] = []
            for alias in self._aliases(name):
                data = primary_map.get(alias, [])
                if data:
                    output[name] = data
                    break
            if output[name]:
                continue
            for alias in self._aliases(name):
                data = fallback_map.get(alias, [])
                if data:
                    output[name] = data
                    break
        return output

    def spreadsheet_title(self) -> str | None:
        return self.primary.get_title()


def _get_log_datetime() -> tuple[str, str]:
    now = datetime.now(ZoneInfo("America/Sao_Paulo"))
    return now.strftime(LOG_DATE_FORMAT), now.strftime(LOG_TIME_FORMAT)


def _normalize_header(header: Any) -> str:
    return normalize_string(header).lower().replace(" ", "_")


def _normalize_text(value: Any) -> str:
    text = normalize_string(value).lower()
    if not text:
        return ""
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return text.strip()


def _normalize_header_loose(value: Any) -> str:
    text = _normalize_text(value)
    text = text.replace(" ", "_")
    return re.sub(r"[^a-z0-9_]", "", text)


def _find_header_index(headers: list[str], *keys: str) -> int:
    if not keys:
        return -1
    targets = {_normalize_header(key) for key in keys if key}
    for idx, header in enumerate(headers):
        if _normalize_header(header) in targets:
            return idx
    return -1


def _ensure_log_headers(client: GSheetsClient) -> list[str]:
    values = client.read_values(SHEET_LOG_REEND)
    if not values:
        headers = ["product_code", "product_name", "location_id_anterior", "location_id_novo", "data", "hora", "motivo", "usuario"]
        client.append_rows(SHEET_LOG_REEND, [headers])
        return headers

    headers = [str(h).strip() if h is not None else "" for h in values[0]]
    normalized = [_normalize_header(h) for h in headers]
    changed = False

    if "product_name" not in normalized:
        if "product_code" in normalized:
            insert_at = normalized.index("product_code") + 1
        else:
            insert_at = 0
        client.insert_columns(SHEET_LOG_REEND, insert_at, 1)
        headers.insert(insert_at, "product_name")
        normalized.insert(insert_at, "product_name")
        changed = True

    if "data" in normalized and "hora" in normalized:
        if changed:
            client.update_header(SHEET_LOG_REEND, headers)
        return headers

    if "data" in normalized and "hora" not in normalized:
        idx = normalized.index("data")
        client.insert_columns(SHEET_LOG_REEND, idx + 1, 1)
        headers.insert(idx + 1, "hora")
        normalized.insert(idx + 1, "hora")
        changed = True
        if changed:
            client.update_header(SHEET_LOG_REEND, headers)
        return headers

    if "data_movimentacao" in normalized:
        idx = normalized.index("data_movimentacao")
        headers[idx] = "data"
        normalized[idx] = "data"
        if "hora" not in normalized:
            client.insert_columns(SHEET_LOG_REEND, idx + 1, 1)
            headers.insert(idx + 1, "hora")
            normalized.insert(idx + 1, "hora")
        changed = True
        if changed:
            client.update_header(SHEET_LOG_REEND, headers)
        return headers

    headers.extend(["data", "hora"])
    changed = True
    if changed:
        client.update_header(SHEET_LOG_REEND, headers)
    return headers


def _build_log_row(headers: list[str], entry: dict[str, Any]) -> list[Any]:
    row = [""] * len(headers)
    data_hora = f"{entry.get('data','')} {entry.get('hora','')}".strip()
    for idx, header in enumerate(headers):
        key = _normalize_header(header)
        if key in {"product_code", "codigo_produto", "produto"}:
            row[idx] = entry.get("product_code") or ""
        elif key in {"product_name", "nome_produto", "produto_nome", "descricao_produto", "desc_produto"}:
            row[idx] = entry.get("product_name") or ""
        elif key in {"location_id_anterior", "loc_anterior", "origem"}:
            row[idx] = entry.get("location_id_anterior") or ""
        elif key in {"location_id_novo", "loc_novo", "destino"}:
            row[idx] = entry.get("location_id_novo") or ""
        elif key == "data":
            row[idx] = entry.get("data") or ""
        elif key == "hora":
            row[idx] = entry.get("hora") or ""
        elif key == "data_movimentacao":
            row[idx] = data_hora
        elif key in {"motivo", "acao"}:
            row[idx] = entry.get("motivo") or ""
        elif key in {"usuario", "user", "email"}:
            row[idx] = entry.get("usuario") or ""
    return row


def _build_new_row_value(header: str, index: int, product_info: dict[str, Any] | None, original_row: list[Any], headers: list[str]) -> Any:
    p = product_info or {}
    is_vazio = not product_info or normalize_string(p.get("product_code")) == "Vazio"
    header_key = normalize_string(header).lower()

    if header_key in {"product_code", "produto_alocado_code"}:
        return None if is_vazio else normalize_string(p.get("product_code")) or None
    if header_key == "product_name":
        return None if is_vazio else p.get("product_name")
    if header_key == "curva":
        return None if is_vazio else p.get("curva")
    if header_key in {"grupo", "grupo_alocado"}:
        return None if is_vazio else p.get("grupo")
    if header_key == "categoria_armazenagem":
        return None if is_vazio else p.get("categoria_armazenagem")
    if header_key == "vol_l_unitario":
        return None if is_vazio else (p.get("vol_l_unitario") or p.get("vol_L_unitario"))
    if header_key == "quantidade":
        return None if is_vazio else p.get("quantidade")
    if header_key == "venda_total":
        return None if is_vazio else p.get("venda_total")
    if header_key == "nm_fabricante":
        return None if is_vazio else p.get("nm_fabricante")
    if header_key == "altura_cm":
        return None if is_vazio else p.get("altura_cm")
    if header_key == "peso_kg_unitario":
        return None if is_vazio else p.get("peso_kg_unitario")
    if header_key == "subcategoria":
        return None if is_vazio else p.get("subcategoria")
    if header_key == "is_pesado":
        return False if is_vazio else parse_bool_flag(p.get("is_pesado"))
    if header_key == "is_alto":
        return False if is_vazio else parse_bool_flag(p.get("is_alto"))
    if header_key == "is_realocado":
        return not is_vazio
    if header_key == "location_id_atual":
        loc_idx = headers.index("location_id") if "location_id" in headers else -1
        return None if is_vazio else (original_row[loc_idx] if loc_idx != -1 and loc_idx < len(original_row) else None)

    return original_row[index] if index < len(original_row) else None


def _build_location_map(headers: list[str], rows: list[list[Any]]) -> dict[str, list[int]]:
    if "location_id" not in headers:
        return {}
    loc_idx = headers.index("location_id")
    location_map: dict[str, list[int]] = {}
    for i, row in enumerate(rows, start=2):
        loc_value = row[loc_idx] if loc_idx < len(row) else None
        loc_id = normalize_string(loc_value)
        if loc_id:
            location_map.setdefault(loc_id, []).append(i)
    return location_map


def get_initial_data_gsheet(sheet_id: str, master_sheet_id: str | None = None) -> dict[str, Any]:
    cache_key = (
        normalize_string(sheet_id),
        normalize_string(master_sheet_id or ""),
    )
    cached = _INITIAL_DATA_CACHE.get(cache_key)
    now = time.time()
    if cached and now - cached[0] <= INITIAL_DATA_CACHE_TTL_SECONDS:
        return cached[1]

    client = GSheetsClient(sheet_id)
    source: Any
    if master_sheet_id and normalize_string(master_sheet_id) != normalize_string(sheet_id):
        fallback = GSheetsClient(master_sheet_id)
        source = FallbackGSheetSource(client, fallback)
    else:
        source = GSheetSource(client)
    payload = get_initial_data(source)
    _INITIAL_DATA_CACHE[cache_key] = (now, payload)
    return payload


def _safe_read_values(client: GSheetsClient, sheet_name: str) -> list[list[Any]]:
    try:
        return client.read_values(sheet_name)
    except Exception:
        return []


def _normalize_depara_value(value: Any) -> str:
    text = normalize_string(value).upper().replace(" ", "")
    text = text.replace("NÃO", "NAO")
    return text


def _normalize_tipo_equip(value: Any) -> str:
    text = normalize_string(value).lower().replace(" ", "_")
    if not text:
        return ""
    if "geladeira" in text or "freezer" in text:
        return "refrigerador"
    return text


def _format_equip_code(rua: Any, equip: Any) -> str | None:
    try:
        rua_num = int(str(rua).strip())
        equip_num = int(str(equip).strip())
        return f"R{rua_num}-{equip_num:03d}"
    except Exception:
        return None


def _build_cadastro_map(rows: list[dict[str, Any]]) -> dict[str, str]:
    if not rows:
        return {}
    headers = list(rows[0].keys())
    rua_key = next((h for h in headers if _normalize_header(h) in {"rua_num", "rua"}), None)
    equip_key = next(
        (h for h in headers if _normalize_header(h) in {"equipamento_num", "equipamento", "equip_num"}),
        None,
    )
    tipo_key = next((h for h in headers if "tipo" in _normalize_header(h)), None)
    if not rua_key or not equip_key or not tipo_key:
        return {}
    mapping: dict[str, str] = {}
    for row in rows:
        code = _format_equip_code(row.get(rua_key), row.get(equip_key))
        if not code:
            continue
        mapping[code] = _normalize_tipo_equip(row.get(tipo_key))
    return mapping


def _extract_equip_from_location(location_id: Any) -> str | None:
    text = normalize_string(location_id).upper()
    match = re.search(r"(R\d+-(?:E)?\d+)", text)
    return match.group(1) if match else None


def _replace_equip_in_location(location_id: Any, new_equip: str) -> str:
    text = normalize_string(location_id)
    if not text:
        return text
    return re.sub(r"R\d+-(?:E)?\d+", new_equip, text)


def _parse_equip_numbers(equip: str) -> tuple[int | None, int | None]:
    match = re.match(r"R(\d+)(?:-?E?)(\d+)", normalize_string(equip).upper().replace(" ", ""))
    if not match:
        return None, None
    return int(match.group(1)), int(match.group(2))


def _extract_product_info_from_row(row_data: list[Any], headers: list[str]) -> dict[str, Any]:
    product_info: dict[str, Any] = {}
    product_columns = {
        "product_code",
        "produto_alocado_code",
        "product_name",
        "curva",
        "grupo",
        "grupo_alocado",
        "categoria_armazenagem",
        "vol_l_unitario",
        "vol_l_unitario",
        "quantidade",
        "venda_total",
        "nm_fabricante",
        "altura_cm",
        "peso_kg_unitario",
        "subcategoria",
        "is_pesado",
        "is_alto",
    }

    for idx, header in enumerate(headers):
        key = _normalize_header(header)
        if key in product_columns:
            product_info[key] = row_data[idx] if idx < len(row_data) else None

    if not product_info.get("product_code") and product_info.get("produto_alocado_code"):
        product_info["product_code"] = product_info.get("produto_alocado_code")
    if not product_info.get("product_code"):
        product_info["product_code"] = "Vazio"
    return product_info


def _build_depara_map(rows: list[dict[str, Any]]) -> dict[str, str]:
    if not rows:
        return {}
    headers = list(rows[0].keys())
    old_key = next((h for h in headers if "antigo" in normalize_string(h).lower()), None)
    new_key = next((h for h in headers if "novo" in normalize_string(h).lower()), None)
    if not old_key or not new_key:
        return {}
    mapping: dict[str, str] = {}
    for row in rows:
        old_val = _normalize_depara_value(row.get(old_key))
        new_val = _normalize_depara_value(row.get(new_key))
        if not new_val:
            continue
        mapping[new_val] = old_val
    return mapping


def _append_rows_in_chunks(client: GSheetsClient, sheet_name: str, rows: list[list[Any]], chunk_size: int = 400) -> None:
    if not rows:
        return
    for i in range(0, len(rows), chunk_size):
        client.append_rows(sheet_name, rows[i : i + chunk_size])


def generate_layout_atual_gsheet(
    sheet_id: str,
    depara_sheet: str = SHEET_DEPARA_DEFAULT,
    output_sheet: str = SHEET_LAYOUT_ATUAL,
) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)

    depara_rows = client.read_sheet(depara_sheet)
    mapping = _build_depara_map(depara_rows)
    if not mapping:
        return {"success": False, "error": f"Aba de/para inválida ou vazia: {depara_sheet}"}

    cadastro_novo_rows = client.read_sheet(SHEET_CADASTRO_NOVO)
    cadastro_antigo_rows = client.read_sheet(SHEET_CADASTRO_ANTIGO)
    cadastro_novo_map = _build_cadastro_map(cadastro_novo_rows)
    cadastro_antigo_map = _build_cadastro_map(cadastro_antigo_rows)

    values = client.read_values(SHEET_PLANO_FINAL)
    if not values:
        return {"success": False, "error": "Plano_Enderecamento_Final vazio ou não encontrado"}

    headers = [str(h).strip() if h is not None else "" for h in values[0]]
    if not headers:
        return {"success": False, "error": "Cabeçalho do Plano_Enderecamento_Final vazio"}

    loc_idx = _find_header_index(headers, "location_id")
    rua_idx = _find_header_index(headers, "rua_num")
    equip_idx = _find_header_index(headers, "equipamento_num")

    if loc_idx == -1:
        return {"success": False, "error": "Coluna location_id não encontrada no Plano_Enderecamento_Final"}

    if "location_id_novo" not in headers:
        headers.append("location_id_novo")
    if "status_ponte" not in headers:
        headers.append("status_ponte")
    if "tipo_equipamento_novo" not in headers:
        headers.append("tipo_equipamento_novo")
    if "tipo_equipamento_antigo" not in headers:
        headers.append("tipo_equipamento_antigo")
    if "status_tipo" not in headers:
        headers.append("status_tipo")

    loc_novo_idx = headers.index("location_id_novo")
    status_idx = headers.index("status_ponte")
    tipo_novo_idx = headers.index("tipo_equipamento_novo")
    tipo_antigo_idx = headers.index("tipo_equipamento_antigo")
    status_tipo_idx = headers.index("status_tipo")

    output_rows: list[list[Any]] = []
    mapped = 0
    missing = 0
    no_exist = 0
    tipo_diferente = 0
    tipo_sem_novo = 0
    tipo_sem_antigo = 0

    for raw in values[1:]:
        row = raw + [None] * (len(headers) - len(raw))
        original_loc = row[loc_idx] if loc_idx != -1 and loc_idx < len(row) else None
        status = "OK"

        new_loc = original_loc
        equip_key = _extract_equip_from_location(original_loc)
        if not original_loc:
            status = "SEM_LOCATION_ID"
            missing += 1
        elif not equip_key:
            status = "SEM_EQUIPAMENTO"
            missing += 1
        else:
            mapped_old = mapping.get(_normalize_depara_value(equip_key))
            if not mapped_old:
                status = "SEM_MAPEAMENTO"
                missing += 1
            elif mapped_old in {"NAOEXISTEMAIS", "NAOEXISTE"}:
                status = "NAO_EXISTE_MAIS"
                no_exist += 1
            else:
                new_loc = _replace_equip_in_location(original_loc, mapped_old)
                mapped += 1
                rua_num, equip_num = _parse_equip_numbers(mapped_old)
                if rua_idx != -1 and rua_num is not None:
                    row[rua_idx] = rua_num
                if equip_idx != -1 and equip_num is not None:
                    row[equip_idx] = equip_num

        tipo_novo = cadastro_novo_map.get(equip_key) if equip_key else None
        tipo_antigo = None
        status_tipo = "OK"
        if status == "NAO_EXISTE_MAIS":
            status_tipo = "NAO_EXISTE_MAIS"
        else:
            old_key = mapping.get(_normalize_depara_value(equip_key)) if equip_key else None
            tipo_antigo = cadastro_antigo_map.get(old_key) if old_key else None
            if not tipo_novo:
                status_tipo = "SEM_CADASTRO_NOVO"
                tipo_sem_novo += 1
            elif not tipo_antigo:
                status_tipo = "SEM_CADASTRO_ANTIGO"
                tipo_sem_antigo += 1
            elif tipo_novo != tipo_antigo:
                status_tipo = "TIPO_DIFERENTE"
                tipo_diferente += 1

        row[loc_idx] = new_loc
        row[loc_novo_idx] = original_loc
        row[status_idx] = status
        row[tipo_novo_idx] = tipo_novo or ""
        row[tipo_antigo_idx] = tipo_antigo or ""
        row[status_tipo_idx] = status_tipo
        output_rows.append(row[: len(headers)])

    client.clear_sheet(output_sheet)
    client.update_header(output_sheet, headers)
    _append_rows_in_chunks(client, output_sheet, output_rows)

    return {
        "success": True,
        "output_sheet": output_sheet,
        "total_rows": len(output_rows),
        "mapped": mapped,
        "missing": missing,
        "nao_existe_mais": no_exist,
        "tipo_diferente": tipo_diferente,
        "tipo_sem_cadastro_novo": tipo_sem_novo,
        "tipo_sem_cadastro_antigo": tipo_sem_antigo,
    }


def save_batch_moves_gsheet(sheet_id: str, moves: list[dict[str, Any]], user: str = "local", skip_full: bool = False) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    client.ensure_sheet(SHEET_PLANO_FINAL)
    values = client.read_values(SHEET_PLANO_FINAL)
    if not values:
        return {"success": False, "error": "Plano_Enderecamento_Final vazio ou não encontrado"}

    headers = [str(h).strip() if h is not None else "" for h in values[0]]
    header_changed = False
    if _find_header_index(headers, "slot_duplo") == -1:
        headers.append("slot_duplo")
        header_changed = True
    rows = [row + [None] * (len(headers) - len(row)) for row in values[1:]]
    original_last_row = len(rows) + 1

    location_map = _build_location_map(headers, rows)
    product_idx = _find_header_index(headers, "product_code", "produto_alocado_code")
    if product_idx == -1:
        return {"success": False, "error": "Coluna product_code não encontrada no Plano_Enderecamento_Final."}
    slot_duplo_idx = _find_header_index(headers, "slot_duplo")

    row_states: dict[int, list[Any]] = {}
    for row_num, row in enumerate(rows, start=2):
        row_states[row_num] = list(row)
    modified_rows: set[int] = set()
    affected_locations: set[str] = set()
    normalized_duplicate_locations: set[str] = set()

    def _row_code(row_num: int) -> str:
        row = row_states.get(row_num)
        if not row or product_idx >= len(row):
            return ""
        return normalize_string(row[product_idx])

    def _is_row_empty(row_num: int) -> bool:
        code = _row_code(row_num)
        if not code or code == "Vazio":
            return True
        return False

    def _write_row(row_num: int, product_info: dict[str, Any] | None) -> None:
        original_row = row_states.get(row_num, [None] * len(headers))
        row_states[row_num] = [
            _build_new_row_value(header, idx, product_info, original_row, headers)
            for idx, header in enumerate(headers)
        ]
        modified_rows.add(row_num)

    def _clone_row_for_location(location_id: str) -> int | None:
        loc_rows = location_map.get(location_id) or []
        if not loc_rows:
            return None
        base_row_num = loc_rows[0]
        base_row = list(row_states.get(base_row_num, [None] * len(headers)))
        next_row_num = (max(row_states.keys()) + 1) if row_states else 2
        row_states[next_row_num] = base_row
        location_map.setdefault(location_id, []).append(next_row_num)
        return next_row_num

    def _find_source_row(location_id: str | None, product_code: str) -> int | None:
        if not location_id:
            return None
        loc_rows = location_map.get(location_id) or []
        if not loc_rows:
            return None
        for row_num in loc_rows:
            if _row_code(row_num) == product_code:
                return row_num
        return None

    def _find_dest_row(location_id: str | None) -> tuple[int | None, str | None]:
        if not location_id:
            return None, "missing"
        loc_rows = location_map.get(location_id) or []
        if not loc_rows:
            return None, "missing"
        for row_num in loc_rows:
            if _is_row_empty(row_num):
                return row_num, None
        occupied_count = sum(0 if _is_row_empty(rn) else 1 for rn in loc_rows)
        if occupied_count >= 2:
            return None, "full"
        new_row_num = _clone_row_for_location(location_id)
        if not new_row_num:
            return None, "missing"
        return new_row_num, None

    for location_id, loc_rows in location_map.items():
        occupied_by_code: dict[str, list[int]] = {}
        for row_num in loc_rows:
            code = _row_code(row_num)
            if not code or code == "Vazio":
                continue
            occupied_by_code.setdefault(code, []).append(row_num)
        for duplicate_rows in occupied_by_code.values():
            if len(duplicate_rows) <= 1:
                continue
            for extra_row_num in duplicate_rows[1:]:
                _write_row(extra_row_num, None)
                affected_locations.add(location_id)
                normalized_duplicate_locations.add(location_id)

    logs: list[dict[str, Any]] = []
    missing_targets: list[str] = []
    full_targets: list[str] = []
    missing_sources: list[str] = []
    data, hora = _get_log_datetime()
    prepared_moves: list[dict[str, Any]] = []

    for move in moves:
        product_code = normalize_string(move.get("productCode"))
        product_info = move.get("productInfo") or {}
        product_name = normalize_string(
            product_info.get("product_name")
            or product_info.get("nome")
            or move.get("productName")
        )
        loc_anterior = normalize_string(move.get("locAnteriorId"))
        loc_novo = normalize_string(move.get("locNovoId"))

        if loc_novo == PRANCHETA_ID:
            continue

        clean_anterior = loc_anterior.replace("bin-", "") if loc_anterior else None
        clean_novo = loc_novo.replace("bin-", "") if loc_novo else None
        expects_target_row = bool(loc_novo and loc_novo not in {UNALLOCATED_ID, PRANCHETA_ID})

        src_row_num = None
        if clean_anterior and loc_anterior not in {PRANCHETA_ID, UNALLOCATED_ID}:
            src_row_num = _find_source_row(clean_anterior, product_code)
            if not src_row_num:
                missing_sources.append(f"{clean_anterior}:{product_code}")
                continue
            affected_locations.add(clean_anterior)

        prepared_moves.append(
            {
                "product_code": product_code,
                "product_info": product_info,
                "product_name": product_name,
                "loc_anterior": loc_anterior,
                "loc_novo": loc_novo,
                "clean_anterior": clean_anterior,
                "clean_novo": clean_novo,
                "expects_target_row": expects_target_row,
                "src_row_num": src_row_num,
            }
        )

    for item in prepared_moves:
        src_row_num = item.get("src_row_num")
        if src_row_num:
            _write_row(src_row_num, None)

    for item in prepared_moves:
        product_code = item["product_code"]
        product_info = item["product_info"]
        product_name = item["product_name"]
        loc_anterior = item["loc_anterior"]
        loc_novo = item["loc_novo"]
        clean_anterior = item["clean_anterior"]
        clean_novo = item["clean_novo"]
        expects_target_row = item["expects_target_row"]

        if loc_novo == UNALLOCATED_ID:
            log_anterior_label = LOG_UNALLOCATED_LABEL if loc_anterior == UNALLOCATED_ID else clean_anterior
            log_novo_label = LOG_UNALLOCATED_LABEL
            if log_anterior_label:
                logs.append(
                    {
                        "product_code": product_code,
                        "product_name": product_name,
                        "location_id_anterior": log_anterior_label,
                        "location_id_novo": log_novo_label,
                        "data": data,
                        "hora": hora,
                        "motivo": "MANUAL-REEND",
                        "usuario": user,
                    }
                )
            continue

        dest_row_num = None
        if expects_target_row:
            dest_row_num, dest_err = _find_dest_row(clean_novo)
            if dest_err == "missing":
                if clean_novo:
                    missing_targets.append(clean_novo)
                continue
            if dest_err == "full":
                if clean_novo:
                    full_targets.append(clean_novo)
                continue
            if not dest_row_num:
                if clean_novo:
                    missing_targets.append(clean_novo)
                continue
            affected_locations.add(clean_novo)

        if dest_row_num:
            _write_row(dest_row_num, product_info)

        log_anterior_label = LOG_UNALLOCATED_LABEL if loc_anterior == UNALLOCATED_ID else clean_anterior
        log_novo_label = LOG_UNALLOCATED_LABEL if loc_novo == UNALLOCATED_ID else clean_novo
        if (log_anterior_label or log_novo_label) and loc_novo != PRANCHETA_ID:
            logs.append(
                {
                    "product_code": product_code,
                    "product_name": product_name,
                    "location_id_anterior": log_anterior_label,
                    "location_id_novo": log_novo_label,
                    "data": data,
                    "hora": hora,
                    "motivo": "MANUAL-REEND",
                    "usuario": user,
                }
            )

    if missing_targets:
        missing_unique = sorted(set(missing_targets))
        preview = ", ".join(missing_unique[:5])
        suffix = "..." if len(missing_unique) > 5 else ""
        return {
            "success": False,
            "error": f"Destino(s) não encontrado(s) no Plano_Enderecamento_Final: {preview}{suffix}",
            "missingTargets": missing_unique,
        }
    if missing_sources:
        missing_source_unique = sorted(set(missing_sources))
        preview = ", ".join(missing_source_unique[:5])
        suffix = "..." if len(missing_source_unique) > 5 else ""
        return {
            "success": False,
            "error": f"Origem(ns) não encontrada(s) para limpar no Plano_Enderecamento_Final: {preview}{suffix}",
            "missingSources": missing_source_unique,
        }
    if full_targets and not skip_full:
        full_unique = sorted(set(full_targets))
        preview = ", ".join(full_unique[:5])
        suffix = "..." if len(full_unique) > 5 else ""
        return {
            "success": False,
            "error": f"Destino(s) cheio(s) (2 produtos por escaninho): {preview}{suffix}",
            "fullTargets": full_unique,
        }

    if slot_duplo_idx >= 0:
        slot_locations = set(location_map.keys()) if header_changed else affected_locations
        for location_id in slot_locations:
            loc_rows = location_map.get(location_id) or []
            if not loc_rows:
                continue
            occupied = sum(0 if _is_row_empty(rn) else 1 for rn in loc_rows)
            flag = "SIM" if occupied >= 2 else "NAO"
            for row_num in loc_rows:
                row = row_states.get(row_num)
                if not row:
                    continue
                if slot_duplo_idx >= len(row):
                    row.extend([None] * (slot_duplo_idx - len(row) + 1))
                if row[slot_duplo_idx] != flag:
                    row[slot_duplo_idx] = flag
                    modified_rows.add(row_num)

    if header_changed:
        client.update_header(SHEET_PLANO_FINAL, headers)

    updates: dict[int, list[Any]] = {}
    append_rows_payload: list[list[Any]] = []
    for row_num in sorted(modified_rows):
        row_values = row_states.get(row_num, [None] * len(headers))
        if row_num <= original_last_row:
            updates[row_num] = row_values[: len(headers)]
        else:
            append_rows_payload.append(row_values[: len(headers)])

    if updates:
        client.update_rows(SHEET_PLANO_FINAL, updates, len(headers))
    if append_rows_payload:
        client.append_rows(SHEET_PLANO_FINAL, append_rows_payload)

    if logs:
        client.ensure_sheet(SHEET_LOG_REEND)
        log_headers = _ensure_log_headers(client)
        log_rows = [_build_log_row(log_headers, entry) for entry in logs]
        client.append_rows(SHEET_LOG_REEND, log_rows)

    result: dict[str, Any] = {
        "success": True,
        "processed": len(moves),
        "updated": len(updates),
        "appended": len(append_rows_payload),
        "logsAdded": len(logs),
        "normalizedDuplicateLocations": sorted(normalized_duplicate_locations),
    }
    if full_targets and skip_full:
        result["skippedFullTargets"] = sorted(set(full_targets))
    return result


def save_single_move_gsheet(sheet_id: str, move: dict[str, Any], user: str = "local") -> dict[str, Any]:
    return save_batch_moves_gsheet(sheet_id, [move], user=user)


def execute_swap_gsheet(sheet_id: str, swap_info: dict[str, Any], user: str = "local") -> dict[str, Any]:
    move_a = swap_info.get("moveA", {})
    move_b = swap_info.get("moveB", {})

    loc_a = normalize_string(move_a.get("locAnteriorId"))
    loc_b = normalize_string(move_b.get("locAnteriorId"))
    product_a = move_a.get("productInfo") or {}
    product_b = move_b.get("productInfo") or {}

    if not loc_a or not loc_b:
        return {"success": False, "error": "Locais de troca inválidos"}

    swap_moves = [
        {
            "productCode": normalize_string(move_b.get("productCode")),
            "locAnteriorId": loc_b,
            "locNovoId": loc_a,
            "productInfo": product_b,
        },
        {
            "productCode": normalize_string(move_a.get("productCode")),
            "locAnteriorId": loc_a,
            "locNovoId": loc_b,
            "productInfo": product_a,
        },
    ]

    return save_batch_moves_gsheet(sheet_id, swap_moves, user=user)


def execute_equipment_swap_gsheet(
    sheet_id: str, equip_a_id: str, equip_b_id: str, user: str = "local"
) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    values = client.read_values(SHEET_PLANO_FINAL)
    if not values:
        return {"success": False, "error": "Aba Plano_Enderecamento_Final vazia."}

    headers = [str(h).strip() if h is not None else "" for h in values[0]]
    data = values[1:]
    header_len = len(headers)

    rua_idx = _find_header_index(headers, "rua_num", "rua")
    equip_idx = _find_header_index(headers, "equipamento_num", "equipamento")
    tipo_idx = _find_header_index(headers, "tipo_equipamento", "tipo")

    if rua_idx == -1 or equip_idx == -1 or tipo_idx == -1:
        return {
            "success": False,
            "error": "Colunas essenciais (rua_num, equipamento_num, tipo_equipamento) não encontradas.",
        }

    rua_a, equip_a = _parse_equip_numbers(equip_a_id)
    rua_b, equip_b = _parse_equip_numbers(equip_b_id)
    if rua_a is None or equip_a is None or rua_b is None or equip_b is None:
        return {"success": False, "error": f"IDs inválidos: {equip_a_id} / {equip_b_id}"}

    rows_a: list[dict[str, Any]] = []
    rows_b: list[dict[str, Any]] = []

    for idx, row in enumerate(data):
        row_full = list(row) + [None] * (header_len - len(row))
        row_rua = parse_number(row_full[rua_idx]) if rua_idx < len(row_full) else None
        row_equip = parse_number(row_full[equip_idx]) if equip_idx < len(row_full) else None
        if row_rua is None or row_equip is None:
            continue
        if int(row_rua) == rua_a and int(row_equip) == equip_a:
            rows_a.append({"index": idx, "row": row_full})
        elif int(row_rua) == rua_b and int(row_equip) == equip_b:
            rows_b.append({"index": idx, "row": row_full})

    if not rows_a or not rows_b:
        return {
            "success": False,
            "error": f"Equipamento não encontrado. A={len(rows_a)} bins, B={len(rows_b)} bins.",
        }
    if len(rows_a) != len(rows_b):
        return {
            "success": False,
            "error": f"Tamanhos incompatíveis: Equipamento A tem {len(rows_a)} bins, B tem {len(rows_b)} bins.",
        }

    tipo_a = normalize_string(rows_a[0]["row"][tipo_idx] if tipo_idx < len(rows_a[0]["row"]) else "")
    tipo_b = normalize_string(rows_b[0]["row"][tipo_idx] if tipo_idx < len(rows_b[0]["row"]) else "")
    if tipo_a != tipo_b:
        return {"success": False, "error": f"Tipos incompatíveis: A='{tipo_a}', B='{tipo_b}'."}

    row_updates: dict[int, list[Any]] = {}
    products_to_log: list[dict[str, Any]] = []

    for i in range(len(rows_a)):
        slot_a = rows_a[i]
        slot_b = rows_b[i]

        info_a = _extract_product_info_from_row(slot_a["row"], headers)
        info_b = _extract_product_info_from_row(slot_b["row"], headers)

        new_row_a = [
            _build_new_row_value(headers[col], col, info_b, slot_a["row"], headers)
            for col in range(header_len)
        ]
        new_row_b = [
            _build_new_row_value(headers[col], col, info_a, slot_b["row"], headers)
            for col in range(header_len)
        ]

        row_updates[slot_a["index"] + 2] = new_row_a
        row_updates[slot_b["index"] + 2] = new_row_b

        if normalize_string(info_a.get("product_code")) not in {"", "Vazio"}:
            products_to_log.append(
                {
                    "product_code": info_a.get("product_code"),
                    "product_name": normalize_string(info_a.get("product_name")),
                    "from": equip_a_id,
                    "to": equip_b_id,
                }
            )
        if normalize_string(info_b.get("product_code")) not in {"", "Vazio"}:
            products_to_log.append(
                {
                    "product_code": info_b.get("product_code"),
                    "product_name": normalize_string(info_b.get("product_name")),
                    "from": equip_b_id,
                    "to": equip_a_id,
                }
            )

    client.update_rows(SHEET_PLANO_FINAL, row_updates, header_len)

    if products_to_log:
        log_headers = _ensure_log_headers(client)
        data_str, hora_str = _get_log_datetime()
        rows = [
            _build_log_row(
                log_headers,
                {
                    "product_code": p["product_code"],
                    "product_name": p.get("product_name") or "",
                    "location_id_anterior": p["from"],
                    "location_id_novo": p["to"],
                    "data": data_str,
                    "hora": hora_str,
                    "motivo": "MANUAL-EQUIP-SWAP",
                    "usuario": user,
                },
            )
            for p in products_to_log
        ]
        _append_rows_in_chunks(client, SHEET_LOG_REEND, rows)

    return {"success": True, "message": f"Troca de {len(rows_a)} escaninhos concluída."}


def create_new_equipment_gsheet(
    sheet_id: str,
    rua_num: Any,
    equip_num: Any,
    equip_type: str,
    user: str = "local",
    master_sheet_id: str | None = None,
) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)

    try:
        rua_num_int = int(float(str(rua_num).replace(",", ".")))
        equip_num_int = int(float(str(equip_num).replace(",", ".")))
    except Exception:
        return {"success": False, "error": "Rua/equipamento inválidos para criação."}

    equip_type_text = str(equip_type or "").strip()
    if not equip_type_text:
        return {"success": False, "error": "Tipo do equipamento não informado."}

    volumetria_values = _safe_read_values(client, SHEET_VOLUMETRIA)
    if (not volumetria_values) and master_sheet_id:
        master_client = GSheetsClient(master_sheet_id)
        volumetria_values = _safe_read_values(master_client, SHEET_VOLUMETRIA)
    if not volumetria_values:
        return {"success": False, "error": "Aba Volumetria_Equipamentos não encontrada."}

    vol_headers = [str(h).strip() if h is not None else "" for h in volumetria_values[0]]
    vol_norm = [_normalize_header_loose(h) for h in vol_headers]

    def vol_idx(candidates: list[str]) -> int:
        for key in candidates:
            key_norm = _normalize_header_loose(key)
            if key_norm in vol_norm:
                return vol_norm.index(key_norm)
        return -1

    tipo_idx = vol_idx(["tipo_equipamento", "tipo"])
    qtd_niveis_idx = vol_idx(["qtd_niveis", "quantidade_niveis"])
    qtd_escaninhos_idx = vol_idx(["qtd_escaninhos_por_nivel", "escaninhos_por_nivel"])
    l_por_escaninho_idx = vol_idx(["l_por_escaninho", "litros_por_escaninho"])
    fator_seg_idx = vol_idx(["fator_seguranca", "fator"])
    niveis_hot_idx = vol_idx(["niveis_hot_zone", "hot_zone"])
    nivel_alto_idx = vol_idx(["nivel_alto"])
    nivel_inf_idx = vol_idx(["nivel_inferior"])

    if tipo_idx == -1 or qtd_niveis_idx == -1 or qtd_escaninhos_idx == -1:
        return {
            "success": False,
            "error": "Volumetria_Equipamentos precisa de tipo_equipamento, qtd_niveis e qtd_escaninhos_por_nivel.",
        }

    def _to_float(value: Any, default: float = 0.0) -> float:
        try:
            return float(str(value).replace(",", "."))
        except Exception:
            return default

    target_type = _normalize_text(equip_type_text)
    tipo_row = None
    for row in volumetria_values[1:]:
        raw = row[tipo_idx] if tipo_idx < len(row) else None
        if _normalize_text(raw) == target_type:
            tipo_row = row
            break
    if not tipo_row:
        return {"success": False, "error": f'Tipo "{equip_type_text}" não encontrado na Volumetria_Equipamentos.'}

    qtd_niveis = int(_to_float(tipo_row[qtd_niveis_idx] if qtd_niveis_idx >= 0 else 0))
    qtd_escaninhos = int(_to_float(tipo_row[qtd_escaninhos_idx] if qtd_escaninhos_idx >= 0 else 0))
    if qtd_niveis <= 0 or qtd_escaninhos <= 0:
        return {"success": False, "error": "Volumetria inválida para o tipo selecionado."}

    capacidade_l = _to_float(tipo_row[l_por_escaninho_idx] if l_por_escaninho_idx >= 0 else 0.0)
    fator_seg = _to_float(tipo_row[fator_seg_idx] if fator_seg_idx >= 0 else 1.0, 1.0)
    capacidade_real = capacidade_l * (fator_seg if fator_seg > 0 else 1.0)
    niveis_hot_zone = str(tipo_row[niveis_hot_idx] if niveis_hot_idx >= 0 else "")
    nivel_alto = str(tipo_row[nivel_alto_idx] if nivel_alto_idx >= 0 else "").strip().upper()
    nivel_inferior = str(tipo_row[nivel_inf_idx] if nivel_inf_idx >= 0 else "").strip().upper()
    hot_levels = {part.strip().upper() for part in re.split(r"[,;\s]+", niveis_hot_zone or "") if part.strip()}

    plano_values = _safe_read_values(client, SHEET_PLANO_FINAL)
    if plano_values and len(plano_values) > 0 and any(str(h or "").strip() for h in plano_values[0]):
        plano_headers = [str(h).strip() if h is not None else "" for h in plano_values[0]]
        plano_rows = [row + [None] * (len(plano_headers) - len(row)) for row in plano_values[1:]]
    else:
        plano_headers = DEFAULT_PLANO_HEADERS[:]
        plano_rows = []
        client.clear_sheet(SHEET_PLANO_FINAL)
        client.append_rows(SHEET_PLANO_FINAL, [plano_headers])

    rua_col = _find_header_index(plano_headers, "rua_num", "rua")
    equip_col = _find_header_index(plano_headers, "equipamento_num", "equipamento")
    galpao_col = _find_header_index(plano_headers, "galpao_id", "galpao")
    if rua_col == -1 or equip_col == -1:
        return {"success": False, "error": "Colunas rua_num/equipamento_num não encontradas no Plano_Enderecamento_Final."}

    for row in plano_rows:
        row_rua = int(_to_float(row[rua_col] if rua_col < len(row) else 0))
        row_equip = int(_to_float(row[equip_col] if equip_col < len(row) else 0))
        if row_rua == rua_num_int and row_equip == equip_num_int:
            return {
                "success": False,
                "error": f"Equipamento R{rua_num_int}-E{equip_num_int} já existe no Plano_Enderecamento_Final.",
            }

    galpao_id = ""
    if galpao_col >= 0:
        for row in plano_rows:
            galpao_value = normalize_string(row[galpao_col] if galpao_col < len(row) else "")
            if galpao_value:
                galpao_id = galpao_value
                break
    if not galpao_id:
        cadastro_values_for_galpao = _safe_read_values(client, SHEET_CADASTRO_NOVO)
        if cadastro_values_for_galpao:
            cad_headers_g = [str(h).strip() if h is not None else "" for h in cadastro_values_for_galpao[0]]
            cad_galpao_col = _find_header_index(cad_headers_g, "galpao_id", "galpao")
            if cad_galpao_col >= 0:
                for row in cadastro_values_for_galpao[1:]:
                    if cad_galpao_col < len(row):
                        val = normalize_string(row[cad_galpao_col])
                        if val:
                            galpao_id = val
                            break
    if not galpao_id:
        galpao_id = "LJ000000"

    alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    rua_str = f"R{rua_num_int}"
    equip_str = f"{equip_num_int:03d}"
    generated_rows: list[list[Any]] = []

    for i in range(qtd_niveis):
        if i >= len(alfabeto):
            break
        nivel_letra = alfabeto[i]
        altura_num = qtd_niveis - i
        for j in range(qtd_escaninhos):
            if j >= len(alfabeto):
                break
            pos_num = j + 1
            pos_letra = alfabeto[j]
            sufixo_id = f"{altura_num}{pos_letra}"
            location_id = f"{galpao_id}-{rua_str}-{equip_str}-{sufixo_id}"
            row_new = _empty_row_for_headers(plano_headers)
            _set_slot_defaults(
                row_new,
                plano_headers,
                location_id=location_id,
                galpao_id=galpao_id,
                rua_num=rua_num_int,
                equip_num=equip_num_int,
                tipo_equipamento=equip_type_text,
                nivel=nivel_letra,
                escaninho=pos_num,
                capacidade_l=capacidade_real,
                is_hot_zone=nivel_letra in hot_levels,
                is_nivel_alto=nivel_letra == nivel_alto,
                is_nivel_inferior=nivel_letra == nivel_inferior,
            )
            generated_rows.append(row_new)

    if not generated_rows:
        return {"success": False, "error": "Nenhum escaninho foi gerado para o novo equipamento."}

    client.append_rows(SHEET_PLANO_FINAL, generated_rows)

    cadastro_values = _safe_read_values(client, SHEET_CADASTRO_NOVO)
    if cadastro_values:
        cad_headers = [str(h).strip() if h is not None else "" for h in cadastro_values[0]]
        cad_rows = [row + [None] * (len(cad_headers) - len(row)) for row in cadastro_values[1:]]
    else:
        cad_headers = ["galpao_id", "rua_num", "equipamento_num", "tipo_equipamento"]
        cad_rows = []
        client.clear_sheet(SHEET_CADASTRO_NOVO)
        client.append_rows(SHEET_CADASTRO_NOVO, [cad_headers])

    cad_rua = _find_header_index(cad_headers, "rua_num", "rua")
    cad_equip = _find_header_index(cad_headers, "equipamento_num", "equipamento")
    cad_tipo = _find_header_index(cad_headers, "tipo_equipamento", "tipo")
    cad_galpao = _find_header_index(cad_headers, "galpao_id", "galpao")
    if cad_rua >= 0 and cad_equip >= 0:
        exists_cadastro = False
        for row in cad_rows:
            row_rua = int(_to_float(row[cad_rua] if cad_rua < len(row) else 0))
            row_equip = int(_to_float(row[cad_equip] if cad_equip < len(row) else 0))
            if row_rua == rua_num_int and row_equip == equip_num_int:
                exists_cadastro = True
                break
        if not exists_cadastro:
            new_cad = [None] * len(cad_headers)
            if cad_galpao >= 0:
                new_cad[cad_galpao] = galpao_id
            if cad_rua >= 0:
                new_cad[cad_rua] = rua_num_int
            if cad_equip >= 0:
                new_cad[cad_equip] = equip_num_int
            if cad_tipo >= 0:
                new_cad[cad_tipo] = equip_type_text
            client.append_rows(SHEET_CADASTRO_NOVO, [new_cad])

    client.ensure_sheet(SHEET_LOG_REEND)
    log_headers = _ensure_log_headers(client)
    data, hora = _get_log_datetime()
    log_entry = {
        "product_code": f"EQUIP-R{rua_num_int}E{equip_num_int}",
        "product_name": f"EQUIPAMENTO {equip_type_text}",
        "location_id_anterior": "CRIADO",
        "location_id_novo": f"R{rua_num_int}-E{equip_num_int} ({equip_type_text})",
        "data": data,
        "hora": hora,
        "motivo": "MANUAL-EQUIP-CREATE",
        "usuario": user,
    }
    client.append_rows(SHEET_LOG_REEND, [_build_log_row(log_headers, log_entry)])

    equip_id = f"R{rua_num_int}-E{equip_num_int}"
    return {
        "success": True,
        "equipId": equip_id,
        "slots_generated": len(generated_rows),
        "message": f"Equipamento {equip_id} ({equip_type_text}) criado com {len(generated_rows)} escaninhos.",
    }


def delete_equipment_and_products_gsheet(
    sheet_id: str,
    equip_id: str,
    user: str = "local",
) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    plano_values = _safe_read_values(client, SHEET_PLANO_FINAL)
    if not plano_values or len(plano_values) < 2:
        return {"success": False, "error": "Aba Plano_Enderecamento_Final vazia ou não encontrada."}

    headers = [str(h).strip() if h is not None else "" for h in plano_values[0]]
    data_rows = [row + [None] * (len(headers) - len(row)) for row in plano_values[1:]]

    rua_idx = _find_header_index(headers, "rua_num", "rua")
    equip_idx = _find_header_index(headers, "equipamento_num", "equipamento")
    loc_idx = _find_header_index(headers, "location_id")
    product_idx = _find_header_index(headers, "product_code", "produto_alocado_code")
    product_name_idx = _find_header_index(headers, "product_name", "nome_produto", "desc_produto")
    if rua_idx == -1 or equip_idx == -1 or loc_idx == -1:
        return {
            "success": False,
            "error": "Colunas essenciais (rua_num, equipamento_num, location_id) não encontradas.",
        }

    rua_num, equip_num = _parse_equip_numbers(equip_id)
    if rua_num is None or equip_num is None:
        return {"success": False, "error": f"ID do equipamento inválido: {equip_id}"}

    kept_rows: list[list[Any]] = []
    removed_rows_count = 0
    products_removed: list[str] = []
    log_entries: list[dict[str, Any]] = []
    data, hora = _get_log_datetime()

    def _to_int(value: Any) -> int:
        try:
            return int(float(str(value).replace(",", ".")))
        except Exception:
            return 0

    for row in data_rows:
        row_rua = _to_int(row[rua_idx] if rua_idx < len(row) else 0)
        row_equip = _to_int(row[equip_idx] if equip_idx < len(row) else 0)
        if row_rua == rua_num and row_equip == equip_num:
            removed_rows_count += 1
            product_code = normalize_string(row[product_idx] if product_idx >= 0 and product_idx < len(row) else "")
            product_name = normalize_string(
                row[product_name_idx] if product_name_idx >= 0 and product_name_idx < len(row) else ""
            )
            if product_code and product_code != "Vazio":
                products_removed.append(product_code)
                log_entries.append(
                    {
                        "product_code": product_code,
                        "product_name": product_name,
                        "location_id_anterior": row[loc_idx] if loc_idx < len(row) else "",
                        "location_id_novo": "DELETADO",
                        "data": data,
                        "hora": hora,
                        "motivo": "MANUAL-EQUIP-DELETE",
                        "usuario": user,
                    }
                )
            continue
        kept_rows.append(row)

    if removed_rows_count == 0:
        return {"success": False, "error": f"Nenhum escaninho encontrado para {equip_id}."}

    client.clear_sheet(SHEET_PLANO_FINAL)
    client.append_rows(SHEET_PLANO_FINAL, [headers] + kept_rows)

    cadastro_values = _safe_read_values(client, SHEET_CADASTRO_NOVO)
    if cadastro_values:
        cad_headers = [str(h).strip() if h is not None else "" for h in cadastro_values[0]]
        cad_rows = [row + [None] * (len(cad_headers) - len(row)) for row in cadastro_values[1:]]
        cad_rua = _find_header_index(cad_headers, "rua_num", "rua")
        cad_equip = _find_header_index(cad_headers, "equipamento_num", "equipamento")
        if cad_rua >= 0 and cad_equip >= 0:
            kept_cad_rows: list[list[Any]] = []
            for row in cad_rows:
                row_rua = _to_int(row[cad_rua] if cad_rua < len(row) else 0)
                row_equip = _to_int(row[cad_equip] if cad_equip < len(row) else 0)
                if row_rua == rua_num and row_equip == equip_num:
                    continue
                kept_cad_rows.append(row)
            client.clear_sheet(SHEET_CADASTRO_NOVO)
            client.append_rows(SHEET_CADASTRO_NOVO, [cad_headers] + kept_cad_rows)

    log_entries.append(
        {
            "product_code": f"EQUIP-{equip_id}",
            "product_name": "EQUIPAMENTO REMOVIDO",
            "location_id_anterior": equip_id,
            "location_id_novo": "DELETADO",
            "data": data,
            "hora": hora,
            "motivo": "MANUAL-EQUIP-DELETE",
            "usuario": user,
        }
    )
    client.ensure_sheet(SHEET_LOG_REEND)
    log_headers = _ensure_log_headers(client)
    log_rows = [_build_log_row(log_headers, entry) for entry in log_entries]
    _append_rows_in_chunks(client, SHEET_LOG_REEND, log_rows)

    return {
        "success": True,
        "productsRemoved": products_removed,
        "message": f"{removed_rows_count} escaninhos deletados.",
    }


def generate_kdabra_sheet_gsheet(sheet_id: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    plano_data = client.read_sheet(SHEET_PLANO_FINAL)

    sheet_name = "KDABTA reenderecar"
    client.ensure_sheet(sheet_name)
    client.clear_sheet(sheet_name)

    headers = ["cod_produto", "galpao", "rua", "estante", "escaninho"]
    rows = [headers]

    for row in plano_data:
        product_code = normalize_string(row.get("product_code"))
        if not product_code or product_code == "Vazio":
            continue
        location_id = normalize_string(row.get("location_id"))
        if not location_id:
            continue
        parts = location_id.split("-")
        if len(parts) < 4:
            continue
        galpao = parts[0]
        rua = parts[1]
        estante_raw = parts[2]
        escaninho = "-".join(parts[3:])
        try:
            estante_num = int(estante_raw)
            estante = str(estante_num).zfill(3)
        except ValueError:
            estante = normalize_string(estante_raw).zfill(3)

        rows.append([product_code, galpao, rua, estante, escaninho])

    client.append_rows(sheet_name, rows)
    return {"success": True, "url": "/api/download", "sheetName": sheet_name}


def generate_kdabra_enderecar_sheet_gsheet(sheet_id: str) -> dict[str, Any]:
    from .data_prep import load_volumetria_map
    from .initial_data import ALFABETO

    client = GSheetsClient(sheet_id)
    plano_data = client.read_sheet(SHEET_PLANO_FINAL)
    cadastro_data = client.read_sheet(SHEET_CADASTRO_NOVO)
    volumetria_data = client.read_sheet(SHEET_VOLUMETRIA)
    volumetria_map = load_volumetria_map(volumetria_data)

    sheet_name = "kdabra enderecar"
    client.ensure_sheet(sheet_name)
    client.clear_sheet(sheet_name)

    headers = ["galpao", "rua", "estante", "escaninho", "ordem"]
    rows = [headers]

    def _parse_location(location_id: str) -> dict[str, Any] | None:
        parts = location_id.split("-")
        if len(parts) < 4:
            return None
        galpao = parts[0]
        rua = parts[1]
        estante = parts[2]
        escaninho = "-".join(parts[3:])
        nivel_match = re.match(r"^(\d+)", escaninho)
        pos_match = re.search(r"([A-Z]+)$", escaninho)
        nivel = nivel_match.group(1) if nivel_match else "0"
        posicao = pos_match.group(1) if pos_match else ""
        try:
            rua_num = int(rua.replace("R", "").replace("r", ""))
        except ValueError:
            rua_num = 0
        try:
            estante_num = int(estante)
        except ValueError:
            estante_num = 0
        return {
            "galpao": galpao, "rua": rua, "estante": estante, "escaninho": escaninho,
            "ruaNum": rua_num, "estanteNum": estante_num, "nivel": nivel, "posicao": posicao,
        }

    unique_locations: dict[str, dict[str, Any]] = {}

    # Locations from the plan (Card 175 data)
    for row in plano_data:
        location_id = normalize_string(row.get("location_id"))
        if not location_id or location_id in unique_locations:
            continue
        parsed = _parse_location(location_id)
        if parsed:
            unique_locations[location_id] = parsed

    # Locations from equipment in the cadastro that have no entries in the plan
    plan_equip_keys: set[tuple[int, int]] = set()
    for row in plano_data:
        loc = normalize_string(row.get("location_id"))
        if not loc:
            continue
        parts = loc.split("-")
        if len(parts) >= 3:
            try:
                rua_n = int(parts[1].replace("R", "").replace("r", ""))
                equip_n = int(parts[2])
                plan_equip_keys.add((rua_n, equip_n))
            except ValueError:
                pass

    galpao_default = ""
    for row in plano_data:
        loc = normalize_string(row.get("location_id"))
        if loc:
            galpao_default = loc.split("-")[0]
            break

    for cad_row in cadastro_data:
        try:
            rua_num = int(parse_number(cad_row.get("rua_num") or cad_row.get("rua")) or 0)
            equip_num = int(parse_number(cad_row.get("equipamento_num") or cad_row.get("equip_num")) or 0)
        except (ValueError, TypeError):
            continue
        if not rua_num or not equip_num:
            continue
        if (rua_num, equip_num) in plan_equip_keys:
            continue
        tipo = normalize_string(cad_row.get("tipo_equipamento") or cad_row.get("tipo")).lower()
        vol_cfg = volumetria_map.get(tipo, {})
        qtd_niveis = max(1, int(parse_number(vol_cfg.get("qtd_niveis")) or 1))
        qtd_esc = max(1, int(parse_number(vol_cfg.get("qtd_escaninhos_por_nivel")) or 1))
        galpao = normalize_string(cad_row.get("galpao_id") or cad_row.get("galpao")) or galpao_default or "LJ000000"
        for nivel in range(1, qtd_niveis + 1):
            for pos in range(1, qtd_esc + 1):
                loc_id = f"{galpao}-R{rua_num}-{equip_num:03d}-{nivel}{ALFABETO[pos - 1]}"
                if loc_id in unique_locations:
                    continue
                parsed = _parse_location(loc_id)
                if parsed:
                    unique_locations[loc_id] = parsed

    all_locations: list[dict[str, Any]] = list(unique_locations.values())

    def sort_key(loc: dict[str, Any]) -> tuple[int, int, int, str]:
        nivel_val = int(loc["nivel"]) if str(loc["nivel"]).isdigit() else 0
        return (loc["ruaNum"], loc["estanteNum"], -nivel_val, loc["posicao"])

    all_locations.sort(key=sort_key)
    for idx, loc in enumerate(all_locations, start=1):
        estante_formatted = str(loc["estanteNum"]).zfill(3)
        rows.append([loc["galpao"], loc["rua"], estante_formatted, loc["escaninho"], idx])

    client.append_rows(sheet_name, rows)
    sheet_url = client.get_sheet_url(sheet_name)
    return {"success": True, "url": sheet_url, "sheetName": sheet_name}


def generate_sku_report_custom_gsheet(
    sheet_id: str, destination: str, abas: list[str], colunas: list[str]
) -> dict[str, Any]:
    if destination == "new":
        source = GSheetSource(GSheetsClient(sheet_id))
        return generate_sku_report_custom(source, destination, abas, colunas)

    client = GSheetsClient(sheet_id)
    source = GSheetSource(client)
    report_data, headers, aba_map = _build_report_dataset(source, abas, colunas)

    for aba in abas:
        config = aba_map.get(aba)
        if not config:
            continue
        sheet_name = f"Relatório SKUs - {config['name']}"
        client.ensure_sheet(sheet_name)
        client.clear_sheet(sheet_name)
        rows = [headers] + report_data.get(config["name"], [])
        client.append_rows(sheet_name, rows)

    return {"success": True, "url": "/api/download", "sheetName": None}


def get_product_by_barcode_gsheet(sheet_id: str, barcode: str) -> dict[str, Any]:
    source = GSheetSource(GSheetsClient(sheet_id))
    return get_product_by_barcode(source, barcode)


def remove_all_products_by_filter_gsheet(sheet_id: str, filter_key: str) -> dict[str, Any]:
    normalized_filter = _normalize_text(filter_key)
    valid_filters = {"quimicos", "perfumaria", "tudo_armz", "prateleira", "geladeira", "freezer"}
    if normalized_filter not in valid_filters:
        return {"success": False, "error": "Filtro inválido para remoção total."}

    client = GSheetsClient(sheet_id)

    base_values = client.read_values(SHEET_BASE_PRODUTOS)
    if not base_values or len(base_values) < 2:
        return {"success": True, "plano_updated": 0}

    headers = [str(h).strip() if h is not None else "" for h in base_values[0]]
    normalized_headers = [_normalize_header_loose(h) for h in headers]

    def find_header_index(candidates: list[str]) -> int:
        for key in candidates:
            key_norm = _normalize_header_loose(key)
            if key_norm in normalized_headers:
                return normalized_headers.index(key_norm)
        return -1

    product_code_idx = find_header_index(
        ["product_code", "codigo_sku", "codigo", "cod_produto", "codigo_produto", "sku"]
    )
    grupo_idx = find_header_index(["grupo", "grupo_alocado", "grupo_produto"])
    categoria_idx = find_header_index(
        ["categoria_armazenagem", "categoria_armz", "cat_armz", "categoria"]
    )

    if product_code_idx == -1:
        return {"success": False, "error": "Coluna product_code não encontrada na Base_Produtos."}
    if normalized_filter in {"quimicos", "perfumaria"} and grupo_idx == -1:
        return {"success": False, "error": "Coluna grupo não encontrada na Base_Produtos."}
    if normalized_filter in {"tudo_armz", "prateleira", "geladeira", "freezer"} and categoria_idx == -1:
        return {"success": False, "error": "Coluna categoria_armazenagem não encontrada na Base_Produtos."}

    product_codes_to_remove: set[str] = set()

    def matches_categoria(categoria: str, filtro: str) -> bool:
        if filtro == "prateleira":
            return categoria == "seco" or "prateleira" in categoria
        if filtro == "geladeira":
            return categoria == "refrigerado" or "geladeira" in categoria
        if filtro == "freezer":
            return categoria == "congelado" or "freezer" in categoria
        return False

    for idx, row in enumerate(base_values[1:], start=2):
        product_code = normalize_string(row[product_code_idx] if product_code_idx < len(row) else None)
        if not product_code or product_code == "Vazio":
            continue

        match = False
        if normalized_filter == "quimicos":
            grupo = _normalize_text(row[grupo_idx] if grupo_idx < len(row) else None)
            match = grupo in {"quimico", "quimicos"}
        elif normalized_filter == "perfumaria":
            grupo = _normalize_text(row[grupo_idx] if grupo_idx < len(row) else None)
            match = grupo == "perfumaria"
        else:
            categoria = _normalize_text(row[categoria_idx] if categoria_idx < len(row) else None)
            if normalized_filter == "tudo_armz":
                match = (
                    matches_categoria(categoria, "prateleira")
                    or matches_categoria(categoria, "geladeira")
                    or matches_categoria(categoria, "freezer")
                )
            else:
                match = matches_categoria(categoria, normalized_filter)

        if match:
            product_codes_to_remove.add(product_code)

    plano_updated = 0
    if product_codes_to_remove:
        plano_values = client.read_values(SHEET_PLANO_FINAL)
        if plano_values and len(plano_values) > 1:
            plano_headers = [str(h).strip() if h is not None else "" for h in plano_values[0]]
            plano_norm = [_normalize_header_loose(h) for h in plano_headers]
            plano_product_idx = -1
            for key in ["product_code", "produto_alocado_code", "codigo_sku", "codigo_produto", "cod_produto"]:
                key_norm = _normalize_header_loose(key)
                if key_norm in plano_norm:
                    plano_product_idx = plano_norm.index(key_norm)
                    break

            if plano_product_idx != -1:
                row_updates: dict[int, list[Any]] = {}
                for idx, row in enumerate(plano_values[1:], start=2):
                    code = normalize_string(row[plano_product_idx] if plano_product_idx < len(row) else None)
                    if code and code in product_codes_to_remove:
                        new_row = [
                            _build_new_row_value(
                                header,
                                col_index,
                                None,
                                row,
                                plano_headers,
                            )
                            for col_index, header in enumerate(plano_headers)
                        ]
                        row_updates[idx] = new_row
                        plano_updated += 1
                if row_updates:
                    client.update_rows(SHEET_PLANO_FINAL, row_updates, len(plano_headers))

    return {
        "success": True,
        "plano_updated": plano_updated,
    }


def preview_remove_all_products_by_filter_gsheet(sheet_id: str, filter_key: str) -> dict[str, Any]:
    normalized_filter = _normalize_text(filter_key)
    valid_filters = {"quimicos", "perfumaria", "tudo_armz", "prateleira", "geladeira", "freezer"}
    if normalized_filter not in valid_filters:
        return {"success": False, "error": "Filtro inválido para remoção total."}

    client = GSheetsClient(sheet_id)
    base_values = client.read_values(SHEET_BASE_PRODUTOS)
    if not base_values or len(base_values) < 2:
        return {"success": True, "sku_count": 0, "plano_count": 0}

    headers = [str(h).strip() if h is not None else "" for h in base_values[0]]
    normalized_headers = [_normalize_header_loose(h) for h in headers]

    def find_header_index(candidates: list[str]) -> int:
        for key in candidates:
            key_norm = _normalize_header_loose(key)
            if key_norm in normalized_headers:
                return normalized_headers.index(key_norm)
        return -1

    product_code_idx = find_header_index(
        ["product_code", "codigo_sku", "codigo", "cod_produto", "codigo_produto", "sku"]
    )
    grupo_idx = find_header_index(["grupo", "grupo_alocado", "grupo_produto"])
    categoria_idx = find_header_index(
        ["categoria_armazenagem", "categoria_armz", "cat_armz", "categoria"]
    )

    if product_code_idx == -1:
        return {"success": False, "error": "Coluna product_code não encontrada na Base_Produtos."}
    if normalized_filter in {"quimicos", "perfumaria"} and grupo_idx == -1:
        return {"success": False, "error": "Coluna grupo não encontrada na Base_Produtos."}
    if normalized_filter in {"tudo_armz", "prateleira", "geladeira", "freezer"} and categoria_idx == -1:
        return {"success": False, "error": "Coluna categoria_armazenagem não encontrada na Base_Produtos."}

    product_codes_to_remove: set[str] = set()

    def matches_categoria(categoria: str, filtro: str) -> bool:
        if filtro == "prateleira":
            return categoria == "seco" or "prateleira" in categoria
        if filtro == "geladeira":
            return categoria == "refrigerado" or "geladeira" in categoria
        if filtro == "freezer":
            return categoria == "congelado" or "freezer" in categoria
        return False

    for row in base_values[1:]:
        product_code = normalize_string(row[product_code_idx] if product_code_idx < len(row) else None)
        if not product_code or product_code == "Vazio":
            continue

        match = False
        if normalized_filter == "quimicos":
            grupo = _normalize_text(row[grupo_idx] if grupo_idx < len(row) else None)
            match = grupo in {"quimico", "quimicos"}
        elif normalized_filter == "perfumaria":
            grupo = _normalize_text(row[grupo_idx] if grupo_idx < len(row) else None)
            match = grupo == "perfumaria"
        else:
            categoria = _normalize_text(row[categoria_idx] if categoria_idx < len(row) else None)
            if normalized_filter == "tudo_armz":
                match = (
                    matches_categoria(categoria, "prateleira")
                    or matches_categoria(categoria, "geladeira")
                    or matches_categoria(categoria, "freezer")
                )
            else:
                match = matches_categoria(categoria, normalized_filter)

        if match:
            product_codes_to_remove.add(product_code)

    if not product_codes_to_remove:
        return {"success": True, "sku_count": 0, "plano_count": 0}

    plano_values = client.read_values(SHEET_PLANO_FINAL)
    if not plano_values or len(plano_values) < 2:
        return {"success": True, "sku_count": 0, "plano_count": 0}

    plano_headers = [str(h).strip() if h is not None else "" for h in plano_values[0]]
    plano_norm = [_normalize_header_loose(h) for h in plano_headers]
    plano_product_idx = -1
    for key in ["product_code", "produto_alocado_code", "codigo_sku", "codigo_produto", "cod_produto"]:
        key_norm = _normalize_header_loose(key)
        if key_norm in plano_norm:
            plano_product_idx = plano_norm.index(key_norm)
            break

    if plano_product_idx == -1:
        return {"success": False, "error": "Coluna product_code não encontrada no Plano_Enderecamento_Final."}

    plano_count = 0
    sku_set: set[str] = set()
    for row in plano_values[1:]:
        code = normalize_string(row[plano_product_idx] if plano_product_idx < len(row) else None)
        if code and code in product_codes_to_remove:
            plano_count += 1
            sku_set.add(code)

    return {"success": True, "sku_count": len(sku_set), "plano_count": plano_count}


def _sanitize_version_name(name: str) -> str:
    text = normalize_string(name)
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text).strip()
    return text or "sem_nome"


def _build_version_sheet_name(client: GSheetsClient, name: str) -> str:
    timestamp = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%Y%m%d_%H%M%S")
    base = _sanitize_version_name(name)
    raw = f"{SHEET_VERSION_PREFIX}{timestamp}__{base}"
    # Google Sheets limit ~= 100 chars
    sheet_name = raw[:100]
    existing = set(client.list_sheet_names())
    if sheet_name not in existing:
        return sheet_name
    counter = 1
    while True:
        suffix = f"_{counter}"
        trimmed = sheet_name[: max(0, 100 - len(suffix))]
        candidate = f"{trimmed}{suffix}"
        if candidate not in existing:
            return candidate
        counter += 1


def save_plano_version_gsheet(sheet_id: str, name: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    values = client.read_values(SHEET_PLANO_FINAL)
    if not values:
        return {"success": False, "error": "Aba Plano_Enderecamento_Final vazia ou não encontrada."}
    sheet_name = _build_version_sheet_name(client, name)
    client.ensure_sheet(sheet_name)
    client.clear_sheet(sheet_name)
    client.append_rows(sheet_name, values)
    return {"success": True, "version_id": sheet_name, "label": sheet_name}


def list_plano_versions_gsheet(sheet_id: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    names = client.list_sheet_names()
    versions: list[dict[str, Any]] = []
    for name in names:
        if not name.startswith(SHEET_VERSION_PREFIX):
            continue
        display = name.replace(SHEET_VERSION_PREFIX, "").replace("__", " ")
        versions.append({"version_id": name, "label": display, "sheet_name": name})
    # Sort desc by name (timestamp first)
    versions.sort(key=lambda v: v.get("version_id", ""), reverse=True)
    return {"success": True, "versions": versions}


def restore_plano_version_gsheet(sheet_id: str, version_id: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    if version_id not in client.list_sheet_names():
        return {"success": False, "error": "Versão não encontrada."}
    values = client.read_values(version_id)
    if not values:
        return {"success": False, "error": "Versão vazia."}
    client.clear_sheet(SHEET_PLANO_FINAL)
    client.append_rows(SHEET_PLANO_FINAL, values)
    return {"success": True, "rows": len(values), "cols": len(values[0]) if values else 0}


def delete_plano_version_gsheet(sheet_id: str, version_id: str) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    if version_id not in client.list_sheet_names():
        return {"success": False, "error": "Versão não encontrada."}
    if not version_id.startswith(SHEET_VERSION_PREFIX):
        return {"success": False, "error": "Apenas versões podem ser removidas."}
    client.delete_sheet(version_id)
    return {"success": True}


def change_equipment_type_gsheet(
    sheet_id: str,
    equip_id: str,
    new_type: str,
    recolher_produtos: bool,
    user: str = "local",
    master_sheet_id: str | None = None,
) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)

    volumetria_values = _safe_read_values(client, SHEET_VOLUMETRIA)
    if (not volumetria_values) and master_sheet_id:
        master_client = GSheetsClient(master_sheet_id)
        volumetria_values = _safe_read_values(master_client, SHEET_VOLUMETRIA)
    if not volumetria_values:
        return {"success": False, "error": "Aba Volumetria_Equipamentos não encontrada."}

    vol_headers = [str(h).strip() if h is not None else "" for h in volumetria_values[0]]
    vol_norm = [_normalize_header_loose(h) for h in vol_headers]

    def vol_idx(candidates: list[str]) -> int:
        for key in candidates:
            key_norm = _normalize_header_loose(key)
            if key_norm in vol_norm:
                return vol_norm.index(key_norm)
        return -1

    tipo_idx = vol_idx(["tipo_equipamento", "tipo"])
    qtd_niveis_idx = vol_idx(["qtd_niveis", "quantidade_niveis"])
    qtd_escaninhos_idx = vol_idx(["qtd_escaninhos_por_nivel", "escaninhos_por_nivel"])
    l_por_escaninho_idx = vol_idx(["l_por_escaninho", "litros_por_escaninho"])
    fator_seg_idx = vol_idx(["fator_seguranca", "fator"])
    niveis_hot_idx = vol_idx(["niveis_hot_zone", "hot_zone"])
    nivel_alto_idx = vol_idx(["nivel_alto"])
    nivel_inf_idx = vol_idx(["nivel_inferior"])

    if tipo_idx == -1:
        return {"success": False, "error": "Coluna tipo_equipamento não encontrada na Volumetria_Equipamentos."}

    def to_float(value: Any) -> float:
        try:
            return float(str(value).replace(",", "."))
        except Exception:
            return 0.0

    target_type = _normalize_text(new_type)
    tipo_row = None
    for row in volumetria_values[1:]:
        raw = row[tipo_idx] if tipo_idx < len(row) else None
        if _normalize_text(raw) == target_type:
            tipo_row = row
            break
    if not tipo_row:
        return {"success": False, "error": f'Tipo "{new_type}" não encontrado na Volumetria_Equipamentos.'}

    qtd_niveis = int(to_float(tipo_row[qtd_niveis_idx] if qtd_niveis_idx >= 0 else 0))
    qtd_escaninhos = int(to_float(tipo_row[qtd_escaninhos_idx] if qtd_escaninhos_idx >= 0 else 0))
    if qtd_niveis <= 0 or qtd_escaninhos <= 0:
        return {"success": False, "error": "Volumetria inválida para o tipo selecionado."}

    capacidade_l = to_float(tipo_row[l_por_escaninho_idx] if l_por_escaninho_idx >= 0 else 0)
    fator_seg = to_float(tipo_row[fator_seg_idx] if fator_seg_idx >= 0 else 1)
    capacidade_real = capacidade_l * (fator_seg if fator_seg else 1)
    niveis_hot_zone = str(tipo_row[niveis_hot_idx] if niveis_hot_idx >= 0 else "")
    nivel_alto = str(tipo_row[nivel_alto_idx] if nivel_alto_idx >= 0 else "")
    nivel_inferior = str(tipo_row[nivel_inf_idx] if nivel_inf_idx >= 0 else "")
    plano_values = client.read_values(SHEET_PLANO_FINAL)
    if not plano_values:
        return {"success": False, "error": "Plano_Enderecamento_Final vazio ou não encontrado."}

    headers = [str(h).strip() if h is not None else "" for h in plano_values[0]]
    rows = [row + [None] * (len(headers) - len(row)) for row in plano_values[1:]]

    def header_idx(key: str) -> int:
        return _find_header_index(headers, key)

    rua_col = header_idx("rua_num")
    equip_col = header_idx("equipamento_num")
    loc_col = header_idx("location_id")
    product_col = header_idx("product_code")
    product_name_col = header_idx("product_name")
    tipo_col = header_idx("tipo_equipamento")
    tipo_final_col = header_idx("tipo_equipamento_final")
    nivel_col = header_idx("nivel")
    escaninho_col = header_idx("escaninho_num_no_nivel")
    galpao_col = header_idx("galpao_id")
    capacidade_col = header_idx("capacidade_l")
    hot_zone_col = header_idx("is_hot_zone")
    nivel_alto_col = header_idx("is_nivel_alto")
    nivel_inf_col = header_idx("is_nivel_inferior")

    if rua_col == -1 or equip_col == -1 or loc_col == -1 or product_col == -1 or tipo_col == -1:
        return {"success": False, "error": "Colunas essenciais não encontradas no Plano_Enderecamento_Final."}

    rua_num, equip_num = _parse_equip_numbers(equip_id)
    if rua_num is None or equip_num is None:
        return {"success": False, "error": f"ID do equipamento inválido: {equip_id}"}

    equip_rows: list[dict[str, Any]] = []
    for idx, row in enumerate(rows, start=2):
        try:
            row_rua = int(to_float(row[rua_col] if rua_col < len(row) else 0))
            row_equip = int(to_float(row[equip_col] if equip_col < len(row) else 0))
        except Exception:
            continue
        if row_rua == rua_num and row_equip == equip_num:
            equip_rows.append({"row_number": idx, "row": row})

    if not equip_rows:
        return {"success": False, "error": f"Equipamento {equip_id} não encontrado no Plano_Enderecamento_Final."}

    total_atual = len(equip_rows)
    total_novo = qtd_niveis * qtd_escaninhos
    galpao_id = equip_rows[0]["row"][galpao_col] if galpao_col >= 0 else "LJ000000"
    galpao_id = galpao_id or "LJ000000"
    rua_str = f"R{rua_num}"
    equipamento_str = f"{equip_num:03d}"

    logs: list[dict[str, Any]] = []
    data, hora = _get_log_datetime()

    # Collect existing product allocations keyed by (nivel_letter, escaninho_num).
    # This lets us carry them over to the rebuilt bins when recolher_produtos=False.
    product_by_slot: dict[tuple[str, int], dict[str, Any]] = {}
    for item in equip_rows:
        row_data = item["row"]
        produto = str(row_data[product_col] if product_col < len(row_data) else "").strip()
        if not produto or produto == "Vazio":
            continue
        product_name = str(
            row_data[product_name_col] if product_name_col >= 0 and product_name_col < len(row_data) else ""
        ).strip()
        nivel_old = str(
            row_data[nivel_col] if nivel_col >= 0 and nivel_col < len(row_data) else ""
        ).strip().upper()
        try:
            pos_old = int(to_float(row_data[escaninho_col] if escaninho_col >= 0 and escaninho_col < len(row_data) else 0))
        except Exception:
            pos_old = 0

        if recolher_produtos:
            logs.append(
                {
                    "product_code": produto,
                    "product_name": product_name,
                    "location_id_anterior": row_data[loc_col],
                    "location_id_novo": LOG_UNALLOCATED_LABEL,
                    "data": data,
                    "hora": hora,
                    "motivo": "MANUAL-CHANGE-TYPE",
                    "usuario": user,
                }
            )
        else:
            product_by_slot[(nivel_old, pos_old)] = {"code": produto, "name": product_name, "row": row_data[:]}

    # Delete ALL old bins so we can regenerate from scratch with correct structure.
    rows_to_delete = [item["row_number"] for item in equip_rows]
    client.delete_rows(SHEET_PLANO_FINAL, rows_to_delete)

    # Generate fresh bins based on the new type's volumetria.
    alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    new_rows: list[list[Any]] = []
    for i in range(qtd_niveis):
        nivel_letra = alfabeto[i]
        altura_num = qtd_niveis - i
        is_hz = nivel_letra in niveis_hot_zone
        is_na = nivel_letra == nivel_alto
        is_ni = nivel_letra == nivel_inferior
        for j in range(qtd_escaninhos):
            posicao_num = j + 1
            posicao_letra = alfabeto[j]
            sufixo_id = f"{altura_num}{posicao_letra}"
            location_id = f"{galpao_id}-{rua_str}-{equipamento_str}-{sufixo_id}"
            new_row = _empty_row_for_headers(headers)
            _set_slot_defaults(
                new_row,
                headers,
                location_id=location_id,
                galpao_id=galpao_id,
                rua_num=rua_num,
                equip_num=equip_num,
                tipo_equipamento=new_type,
                nivel=nivel_letra,
                escaninho=posicao_num,
                capacidade_l=capacidade_real,
                is_hot_zone=is_hz,
                is_nivel_alto=is_na,
                is_nivel_inferior=is_ni,
            )
            # Carry over product when recolher_produtos=False and the slot matches.
            slot_key = (nivel_letra, posicao_num)
            if not recolher_produtos and slot_key in product_by_slot:
                slot_data = product_by_slot.pop(slot_key)
                old_row = slot_data["row"]
                # Copy product-related fields from the old row, preserving structural fields.
                structural_keys = {
                    "location_id", "galpao_id", "rua_num", "equipamento_num",
                    "tipo_equipamento", "tipo_equipamento_final", "nivel",
                    "escaninho_num_no_nivel", "capacidade_l",
                    "is_hot_zone", "is_nivel_alto", "is_nivel_inferior",
                }
                for idx, header in enumerate(headers):
                    if _normalize_header(header) not in structural_keys and idx < len(old_row):
                        new_row[idx] = old_row[idx]
            new_rows.append(new_row)

    # Products that couldn't be matched to a new slot → log as unallocated.
    for slot_key, slot_data in product_by_slot.items():
        logs.append(
            {
                "product_code": slot_data["code"],
                "product_name": slot_data["name"],
                "location_id_anterior": slot_data["row"][loc_col] if loc_col < len(slot_data["row"]) else "",
                "location_id_novo": LOG_UNALLOCATED_LABEL,
                "data": data,
                "hora": hora,
                "motivo": "MANUAL-CHANGE-TYPE",
                "usuario": user,
            }
        )

    if new_rows:
        client.append_rows(SHEET_PLANO_FINAL, new_rows)

    cadastro_values = client.read_values(SHEET_CADASTRO_NOVO)
    if cadastro_values:
        cad_headers = [str(h).strip() if h is not None else "" for h in cadastro_values[0]]
        cad_rows = [row + [None] * (len(cad_headers) - len(row)) for row in cadastro_values[1:]]
        cad_rua = _find_header_index(cad_headers, "rua_num")
        cad_equip = _find_header_index(cad_headers, "equipamento_num")
        cad_tipo = _find_header_index(cad_headers, "tipo_equipamento")
        if cad_rua >= 0 and cad_equip >= 0 and cad_tipo >= 0:
            cad_updates: dict[int, list[Any]] = {}
            for idx, row in enumerate(cad_rows, start=2):
                if int(to_float(row[cad_rua] if cad_rua < len(row) else 0)) == rua_num and int(
                    to_float(row[cad_equip] if cad_equip < len(row) else 0)
                ) == equip_num:
                    new_row = row[:]
                    new_row[cad_tipo] = new_type
                    cad_updates[idx] = new_row
            if cad_updates:
                client.update_rows(SHEET_CADASTRO_NOVO, cad_updates, len(cad_headers))

    if logs:
        client.ensure_sheet(SHEET_LOG_REEND)
        log_headers = _ensure_log_headers(client)
        log_rows = [_build_log_row(log_headers, entry) for entry in logs]
        client.append_rows(SHEET_LOG_REEND, log_rows)

    return {"success": True, "message": f'Tipo do equipamento {equip_id} alterado para "{new_type}".'}


def _empty_row_for_headers(headers: list[str]) -> list[Any]:
    row = [None] * len(headers)
    for idx, header in enumerate(headers):
        key = _normalize_header(header)
        if key in {"product_code", "produto_alocado_code"}:
            row[idx] = "Vazio"
    return row


def _set_slot_defaults(
    row: list[Any],
    headers: list[str],
    *,
    location_id: str,
    galpao_id: str,
    rua_num: int,
    equip_num: int,
    tipo_equipamento: str,
    nivel: str,
    escaninho: int,
    capacidade_l: float,
    is_hot_zone: bool,
    is_nivel_alto: bool,
    is_nivel_inferior: bool,
) -> None:
    for idx, header in enumerate(headers):
        key = _normalize_header(header)
        if key == "location_id":
            row[idx] = location_id
        elif key == "galpao_id":
            row[idx] = galpao_id
        elif key == "rua_num":
            row[idx] = rua_num
        elif key == "equipamento_num":
            row[idx] = equip_num
        elif key == "tipo_equipamento":
            row[idx] = tipo_equipamento
        elif key == "tipo_equipamento_final":
            row[idx] = tipo_equipamento
        elif key == "nivel":
            row[idx] = nivel
        elif key == "escaninho_num_no_nivel":
            row[idx] = escaninho
        elif key == "capacidade_l":
            row[idx] = capacidade_l
        elif key == "is_hot_zone":
            row[idx] = is_hot_zone
        elif key == "is_nivel_alto":
            row[idx] = is_nivel_alto
        elif key == "is_nivel_inferior":
            row[idx] = is_nivel_inferior
        elif key in {"product_code", "produto_alocado_code"}:
            row[idx] = "Vazio"


def add_new_product_gsheet(sheet_id: str, product: dict[str, Any]) -> dict[str, Any]:
    return update_base_product_gsheet(sheet_id, "", product, allow_create=True)


def _upsert_edicoes_manuais(
    client: GSheetsClient,
    base_headers: list[str],
    code_idx: int,
    product_code: str,
    payload: dict[str, Any],
) -> None:
    """Persist manual product edits to Edicoes_Manuais so they survive ETL re-runs.

    Creates the sheet on first use. Upserts one row per product_code; only the
    fields present in ``payload`` are stored (empty payload = no-op).
    """
    try:
        editable_fields = {
            _normalize_header_loose(k)
            for k in payload
            if k and _normalize_header_loose(k) != _normalize_header_loose("product_code")
        }
        if not editable_fields:
            return

        client.ensure_sheet(SHEET_EDICOES_MANUAIS)
        values = client.read_values(SHEET_EDICOES_MANUAIS)

        if not values or not any(str(h or "").strip() for h in values[0]):
            ov_headers = ["product_code"] + [h for h in base_headers if h and h != "product_code"]
            client.clear_sheet(SHEET_EDICOES_MANUAIS)
            client.append_rows(SHEET_EDICOES_MANUAIS, [ov_headers])
            values = [ov_headers]

        ov_headers = [str(h or "").strip() for h in values[0]]
        ov_norm = [_normalize_header_loose(h) for h in ov_headers]
        ov_code_idx = next(
            (i for i, n in enumerate(ov_norm) if n == _normalize_header_loose("product_code")), -1
        )
        if ov_code_idx == -1:
            return

        norm_code = normalize_string(product_code)
        data_rows = [list(r) + [""] * max(0, len(ov_headers) - len(r)) for r in values[1:]]
        target_ov_row: int | None = None
        for idx, row in enumerate(data_rows, start=2):
            if normalize_string(row[ov_code_idx] if ov_code_idx < len(row) else "") == norm_code:
                target_ov_row = idx
                break

        if target_ov_row is not None:
            ov_row = data_rows[target_ov_row - 2][:]
        else:
            ov_row = [""] * len(ov_headers)
            ov_row[ov_code_idx] = product_code

        ov_header_map = {n: i for i, n in enumerate(ov_norm)}
        for key, value in payload.items():
            key_norm = _normalize_header_loose(key)
            col = ov_header_map.get(key_norm)
            if col is not None:
                ov_row[col] = value

        if target_ov_row is not None:
            client.update_rows(SHEET_EDICOES_MANUAIS, {target_ov_row: ov_row}, len(ov_headers))
        else:
            client.append_rows(SHEET_EDICOES_MANUAIS, [ov_row])
    except Exception:
        pass  # Never fail the main save because of override persistence


def update_base_product_gsheet(
    sheet_id: str,
    original_code: str,
    product: dict[str, Any],
    *,
    allow_create: bool = False,
) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    values = client.read_values(SHEET_BASE_PRODUTOS)
    if not values:
        return {"success": False, "error": "Aba Base_Produtos não encontrada ou vazia."}

    headers = [str(h).strip() if h is not None else "" for h in values[0]]
    norm_headers = [_normalize_header_loose(h) for h in headers]
    if not headers:
        return {"success": False, "error": "Cabeçalho da Base_Produtos vazio."}

    code_idx = -1
    for key in ["product_code", "cod_produto", "codigo_produto", "codigo_sku"]:
        key_norm = _normalize_header_loose(key)
        if key_norm in norm_headers:
            code_idx = norm_headers.index(key_norm)
            break
    if code_idx == -1:
        return {"success": False, "error": "Coluna product_code não encontrada na Base_Produtos."}

    payload = product or {}
    payload_code = normalize_string(payload.get("product_code"))
    lookup_code = normalize_string(original_code) or payload_code
    if not lookup_code:
        return {"success": False, "error": "Código do produto não informado."}

    data_rows = [row + [None] * (len(headers) - len(row)) for row in values[1:]]
    target_row_number = None
    for idx, row in enumerate(data_rows, start=2):
        row_code = normalize_string(row[code_idx] if code_idx < len(row) else "")
        if row_code == lookup_code:
            target_row_number = idx
            break

    header_map = {_normalize_header_loose(h): i for i, h in enumerate(headers)}
    updated_row = None

    if target_row_number is not None:
        updated_row = data_rows[target_row_number - 2][:]
    elif allow_create:
        updated_row = [None] * len(headers)
        updated_row[code_idx] = payload_code or lookup_code
    else:
        return {"success": False, "error": f"Produto {lookup_code} não encontrado na Base_Produtos."}

    for key, value in payload.items():
        key_norm = _normalize_header_loose(key)
        idx = header_map.get(key_norm)
        if idx is None:
            continue
        updated_row[idx] = value

    if code_idx < len(updated_row):
        updated_row[code_idx] = normalize_string(updated_row[code_idx] or lookup_code)
    if not normalize_string(updated_row[code_idx]):
        return {"success": False, "error": "product_code não pode ficar vazio."}

    if target_row_number is not None:
        client.update_rows(SHEET_BASE_PRODUTOS, {target_row_number: updated_row}, len(headers))
        result_mode = "update"
    else:
        client.append_rows(SHEET_BASE_PRODUTOS, [updated_row])
        result_mode = "create"

    final_code = updated_row[code_idx]
    _upsert_edicoes_manuais(client, headers, code_idx, final_code, payload)
    return {"success": True, "mode": result_mode, "product_code": final_code}


def generate_slots_from_cadastro_gsheet(
    sheet_id: str,
    clear_existing: bool = True,
    master_sheet_id: str | None = None,
) -> dict[str, Any]:
    client = GSheetsClient(sheet_id)
    cadastro_values = _safe_read_values(client, SHEET_CADASTRO_NOVO)
    volumetria_values = _safe_read_values(client, SHEET_VOLUMETRIA)
    if (not volumetria_values) and master_sheet_id:
        master_client = GSheetsClient(master_sheet_id)
        volumetria_values = _safe_read_values(master_client, SHEET_VOLUMETRIA)
    client.ensure_sheet(SHEET_PLANO_FINAL)
    plano_values = _safe_read_values(client, SHEET_PLANO_FINAL)

    if not cadastro_values:
        return {"success": False, "error": "Aba Cadastro_Equipamentos não encontrada ou vazia."}
    if not volumetria_values:
        return {"success": False, "error": "Aba Volumetria_Equipamentos não encontrada ou vazia."}
    cad_headers = [str(h).strip() if h is not None else "" for h in cadastro_values[0]]
    cad_rows = [row + [None] * (len(cad_headers) - len(row)) for row in cadastro_values[1:]]
    vol_headers = [str(h).strip() if h is not None else "" for h in volumetria_values[0]]
    vol_rows = [row + [None] * (len(vol_headers) - len(row)) for row in volumetria_values[1:]]
    if plano_values and len(plano_values) > 0 and any(str(h or "").strip() for h in plano_values[0]):
        plan_headers = [str(h).strip() if h is not None else "" for h in plano_values[0]]
    else:
        plan_headers = DEFAULT_PLANO_HEADERS[:]
        client.clear_sheet(SHEET_PLANO_FINAL)
        client.append_rows(SHEET_PLANO_FINAL, [plan_headers])

    cad_galpao = _find_header_index(cad_headers, "galpao_id", "galpao")
    cad_rua = _find_header_index(cad_headers, "rua_num", "rua")
    cad_equip = _find_header_index(cad_headers, "equipamento_num", "equipamento")
    cad_tipo = _find_header_index(cad_headers, "tipo_equipamento", "tipo")
    if cad_rua == -1 or cad_equip == -1 or cad_tipo == -1:
        return {
            "success": False,
            "error": "Cadastro_Equipamentos precisa de rua_num, equipamento_num e tipo_equipamento.",
        }

    vol_tipo = _find_header_index(vol_headers, "tipo_equipamento", "tipo")
    vol_qtd_niveis = _find_header_index(vol_headers, "qtd_niveis")
    vol_qtd_esc = _find_header_index(vol_headers, "qtd_escaninhos_por_nivel")
    vol_l = _find_header_index(vol_headers, "l_por_escaninho")
    vol_fator = _find_header_index(vol_headers, "fator_seguranca")
    vol_hot = _find_header_index(vol_headers, "niveis_hot_zone")
    vol_nivel_alto = _find_header_index(vol_headers, "nivel_alto")
    vol_nivel_inf = _find_header_index(vol_headers, "nivel_inferior")
    if vol_tipo == -1 or vol_qtd_niveis == -1 or vol_qtd_esc == -1:
        return {
            "success": False,
            "error": "Volumetria_Equipamentos precisa de tipo_equipamento, qtd_niveis e qtd_escaninhos_por_nivel.",
        }

    vol_map: dict[str, dict[str, Any]] = {}
    def _safe_float(value: Any, default: float = 0.0) -> float:
        try:
            return float(str(value).replace(",", "."))
        except Exception:
            return default

    for row in vol_rows:
        tipo = _normalize_text(row[vol_tipo] if vol_tipo < len(row) else None)
        if not tipo:
            continue
        qtd_niveis = int(_safe_float(row[vol_qtd_niveis], 0.0) if vol_qtd_niveis < len(row) else 0)
        qtd_esc = int(_safe_float(row[vol_qtd_esc], 0.0) if vol_qtd_esc < len(row) else 0)
        vol_map[tipo] = {
            "qtd_niveis": qtd_niveis,
            "qtd_esc": qtd_esc,
            "l_por": _safe_float(row[vol_l], 0.0) if vol_l >= 0 and vol_l < len(row) else 0.0,
            "fator": _safe_float(row[vol_fator], 1.0) if vol_fator >= 0 and vol_fator < len(row) else 1.0,
            "hot": str(row[vol_hot]).strip().upper() if vol_hot >= 0 and vol_hot < len(row) and row[vol_hot] else "",
            "nivel_alto": str(row[vol_nivel_alto]).strip().upper()
            if vol_nivel_alto >= 0 and vol_nivel_alto < len(row) and row[vol_nivel_alto]
            else "",
            "nivel_inf": str(row[vol_nivel_inf]).strip().upper()
            if vol_nivel_inf >= 0 and vol_nivel_inf < len(row) and row[vol_nivel_inf]
            else "",
        }

    alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    generated_rows: list[list[Any]] = []
    missing_types: set[str] = set()
    equipment_count = 0

    def _safe_to_int(value: Any) -> int:
        text = normalize_string(value).replace(",", ".")
        match = re.search(r"-?\d+(?:\.\d+)?", text)
        if not match:
            return 0
        try:
            return int(float(match.group(0)))
        except Exception:
            return 0

    sorted_cadastro = sorted(
        cad_rows,
        key=lambda row: (
            _safe_to_int(row[cad_rua] if cad_rua < len(row) else 0),
            _safe_to_int(row[cad_equip] if cad_equip < len(row) else 0),
        ),
    )

    for row in sorted_cadastro:
        rua_num = _safe_to_int(row[cad_rua] if cad_rua < len(row) else None)
        equip_num = _safe_to_int(row[cad_equip] if cad_equip < len(row) else None)
        if rua_num <= 0 or equip_num <= 0:
            continue
        tipo_raw = row[cad_tipo] if cad_tipo < len(row) else ""
        tipo_norm = _normalize_text(tipo_raw)
        if not tipo_norm:
            continue
        vol_cfg = vol_map.get(tipo_norm)
        if not vol_cfg:
            missing_types.add(str(tipo_raw))
            continue

        qtd_niveis = int(vol_cfg["qtd_niveis"])
        qtd_esc = int(vol_cfg["qtd_esc"])
        if qtd_niveis <= 0 or qtd_esc <= 0:
            continue

        equipment_count += 1
        galpao = normalize_string(row[cad_galpao] if cad_galpao >= 0 and cad_galpao < len(row) else "") or "LJ000000"
        rua_str = f"R{rua_num}"
        equip_str = f"{equip_num:03d}"
        capacidade = float(vol_cfg["l_por"]) * (float(vol_cfg["fator"]) if float(vol_cfg["fator"]) > 0 else 1.0)
        hot_levels = {part.strip().upper() for part in re.split(r"[,;\\s]+", vol_cfg["hot"]) if part.strip()}
        nivel_alto = vol_cfg["nivel_alto"]
        nivel_inf = vol_cfg["nivel_inf"]

        for i in range(qtd_niveis):
            nivel_letra = alfabeto[i]
            altura_num = qtd_niveis - i
            for j in range(qtd_esc):
                pos_num = j + 1
                pos_letra = alfabeto[j]
                location_id = f"{galpao}-{rua_str}-{equip_str}-{altura_num}{pos_letra}"
                row_new = _empty_row_for_headers(plan_headers)
                _set_slot_defaults(
                    row_new,
                    plan_headers,
                    location_id=location_id,
                    galpao_id=galpao,
                    rua_num=rua_num,
                    equip_num=equip_num,
                    tipo_equipamento=str(tipo_raw).strip(),
                    nivel=nivel_letra,
                    escaninho=pos_num,
                    capacidade_l=capacidade,
                    is_hot_zone=nivel_letra in hot_levels,
                    is_nivel_alto=nivel_letra == nivel_alto,
                    is_nivel_inferior=nivel_letra == nivel_inf,
                )
                generated_rows.append(row_new)

    if not generated_rows:
        vol_types = sorted(vol_map.keys())
        cad_types = sorted({
            _normalize_text(row[cad_tipo] if cad_tipo < len(row) else "")
            for row in cad_rows if _normalize_text(row[cad_tipo] if cad_tipo < len(row) else "")
        })
        return {
            "success": False,
            "error": (
                f"Nenhum escaninho gerado. "
                f"Tipos no Cadastro: {cad_types}. "
                f"Tipos na Volumetria: {vol_types}. "
                "Verifique se os nomes de tipo_equipamento coincidem nas duas abas."
            ),
        }

    if clear_existing:
        client.clear_sheet(SHEET_PLANO_FINAL)
        client.append_rows(SHEET_PLANO_FINAL, [plan_headers] + generated_rows)
    elif generated_rows:
        client.append_rows(SHEET_PLANO_FINAL, generated_rows)

    result: dict[str, Any] = {
        "success": True,
        "equipments_processed": equipment_count,
        "slots_generated": len(generated_rows),
        "plano_sheet_url": client.get_sheet_url(SHEET_PLANO_FINAL),
    }
    if missing_types:
        result["missing_types"] = sorted(missing_types)
    return result
