from __future__ import annotations

import json
import os
import unicodedata
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

from openpyxl import Workbook

from .apps_script_client import call_apps_script_webapp_action
from .gsheets_client import CREDENTIALS_DIR, GSheetsClient
from .utils import normalize_string, parse_number

DEFAULT_METABASE_URL = "https://metabase.kdabra.com.br"
DEFAULT_CARD_ID = 823
DEFAULT_TIMEOUT_SECONDS = 60
SHEET_VENDAS_ALVO = "Vendas Alvo"
VENDAS_ALVO_HEADERS = ["cod_produto", "desc_produto", "qtd_total"]
METABASE_CONTEXT_PATH = CREDENTIALS_DIR / "metabase_sales_context.json"
METABASE_ENV_PATH = CREDENTIALS_DIR / "metabase.env"
METABASE_CREDENTIALS_JSON_PATH = CREDENTIALS_DIR / "metabase_credentials.json"

STORE_OPTIONS: list[dict[str, str]] = [
    {"value": "altoDePinheiros", "label": "Alto de Pinheiros"},
    {"value": "barraFunda", "label": "Barra Funda"},
    {"value": "brooklin", "label": "Brooklin"},
    {"value": "higienopolis", "label": "Higienópolis"},
    {"value": "moema", "label": "Moema"},
    {"value": "morumbi", "label": "Morumbi"},
    {"value": "pamplona", "label": "Jardins / Pamplona"},
    {"value": "pinheiros", "label": "Pinheiros"},
    {"value": "vilaMariana", "label": "Vila Mariana"},
    {"value": "vilaOlimpia", "label": "Vila Olímpia"},
]

STORE_LABEL_BY_ID = {item["value"]: item["label"] for item in STORE_OPTIONS}
STORE_CODE_TO_METABASE_LOJA = {
    "LJ060001": "pamplona",
}
STORE_KEYWORDS_BY_ID = {
    "altoDePinheiros": ["alto de pinheiros"],
    "barraFunda": ["barra funda"],
    "brooklin": ["brooklin"],
    "higienopolis": ["higienopolis"],
    "moema": ["moema"],
    "morumbi": ["morumbi"],
    "pamplona": ["pamplona", "jardins"],
    "pinheiros": ["pinheiros"],
    "vilaMariana": ["vila mariana"],
    "vilaOlimpia": ["vila olimpia"],
}


def _strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFD", str(text or ""))
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _norm_text(value: Any) -> str:
    return " ".join(_strip_accents(str(value or "")).strip().lower().split())


def _load_context() -> dict[str, Any]:
    if not METABASE_CONTEXT_PATH.exists():
        return {}
    try:
        return json.loads(METABASE_CONTEXT_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_context(payload: dict[str, Any]) -> None:
    METABASE_CONTEXT_PATH.parent.mkdir(parents=True, exist_ok=True)
    METABASE_CONTEXT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _default_sales_range(today: date | None = None) -> tuple[str, str]:
    reference = today or date.today()
    end_date = reference
    anchor = reference - timedelta(days=1)
    previous_month_last_day = anchor.replace(day=1) - timedelta(days=1)
    start_day = min(anchor.day, previous_month_last_day.day)
    start_date = previous_month_last_day.replace(day=start_day)
    return start_date.isoformat(), end_date.isoformat()


def _normalize_store_ids(raw_stores: Any) -> list[str]:
    known = set(STORE_LABEL_BY_ID.keys())
    normalized: list[str] = []
    for raw in raw_stores or []:
        value = str(raw or "").strip()
        if not value or value not in known or value in normalized:
            continue
        normalized.append(value)
    return normalized


def get_metabase_sales_context() -> dict[str, Any]:
    context = _load_context()
    default_initial, default_final = _default_sales_range()
    stores = _normalize_store_ids(context.get("stores")) or [item["value"] for item in STORE_OPTIONS]
    return {
        "data_inicial": default_initial,
        "data_final": default_final,
        "stores": stores,
        "available_stores": STORE_OPTIONS,
        "base_url": DEFAULT_METABASE_URL,
        "card_id": DEFAULT_CARD_ID,
    }


def save_metabase_sales_context(
    *,
    data_inicial: str,
    data_final: str,
    stores: list[str],
) -> dict[str, Any]:
    payload = {
        "stores": _normalize_store_ids(stores),
    }
    _save_context(payload)
    return get_metabase_sales_context()


def _load_metabase_backend_credentials() -> tuple[str, str, str]:
    session_id = str(os.getenv("MB_SESSION_ID", "")).strip()
    username = str(os.getenv("MB_USER", "")).strip()
    password = str(os.getenv("MB_PASS", "")).strip()
    if session_id or (username and password):
        return session_id, username, password

    if METABASE_ENV_PATH.exists():
        try:
            for raw_line in METABASE_ENV_PATH.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip("'").strip('"')
                if key == "MB_SESSION_ID" and not session_id:
                    session_id = value
                elif key == "MB_USER" and not username:
                    username = value
                elif key == "MB_PASS" and not password:
                    password = value
        except Exception:
            pass

    if (not session_id) and (not (username and password)) and METABASE_CREDENTIALS_JSON_PATH.exists():
        try:
            payload = json.loads(METABASE_CREDENTIALS_JSON_PATH.read_text(encoding="utf-8"))
            session_id = session_id or str(payload.get("MB_SESSION_ID") or payload.get("session_id") or "").strip()
            username = username or str(payload.get("MB_USER") or payload.get("username") or "").strip()
            password = password or str(payload.get("MB_PASS") or payload.get("password") or "").strip()
        except Exception:
            pass

    return session_id, username, password


def _validate_iso_date(value: str, field_name: str) -> str:
    text = str(value or "").strip()
    try:
        return datetime.strptime(text, "%Y-%m-%d").date().isoformat()
    except ValueError as exc:
        raise ValueError(f"{field_name} inválida. Use YYYY-MM-DD.") from exc


def _parse_response_date(value: Any) -> date | None:
    text = str(value or "").strip()
    if not text:
        return None
    candidate = text[:10]
    try:
        return datetime.strptime(candidate, "%Y-%m-%d").date()
    except ValueError:
        return None


def _build_parameters(data_inicial: str, data_final: str, loja: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "date/single",
            "value": data_inicial,
            "target": ["variable", ["template-tag", "data_inicial"]],
        },
        {
            "type": "date/single",
            "value": data_final,
            "target": ["variable", ["template-tag", "data_final"]],
        },
        {
            "type": "category",
            "value": loja,
            "target": ["variable", ["template-tag", "Loja"]],
        },
    ]


def build_parameters(data_inicial: str, data_final: str, loja: str) -> list[dict[str, Any]]:
    return _build_parameters(data_inicial, data_final, loja)


def _min_available_row_date(rows: list[dict[str, Any]]) -> str:
    dates = [item for item in (_parse_response_date(row.get("data_entrega")) for row in rows) if item]
    if not dates:
        return ""
    return min(dates).isoformat()


def _fetch_rows_via_apps_script(
    *,
    data_inicial: str,
    data_final: str,
    stores: list[str],
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    payload = {
        "data_inicial": data_inicial,
        "data_final": data_final,
        "stores": stores,
        "timeout_seconds": timeout_seconds,
    }
    result = call_apps_script_webapp_action(
        "fetchCard823Rows",
        payload,
        timeout_seconds=max(timeout_seconds, 90),
    )
    if not isinstance(result, dict):
        raise RuntimeError("Apps Script retornou payload inválido para card 823.")
    return result


def resolve_store_value(loja: str = "", cod_loja: str = "") -> str:
    store_value = str(loja or "").strip()
    if store_value:
        return store_value

    normalized_code = str(cod_loja or "").strip().upper()
    if not normalized_code:
        raise ValueError("Informe loja ou cod_loja.")

    mapped = STORE_CODE_TO_METABASE_LOJA.get(normalized_code)
    if mapped:
        return mapped

    raise ValueError(
        f"cod_loja {normalized_code} sem mapeamento local. Informe o valor exato da template-tag Loja."
    )


def _decode_http_error(exc: urllib_error.HTTPError) -> str:
    try:
        body = exc.read().decode("utf-8", errors="replace")
    except Exception:
        body = ""
    snippet = body[:600].strip()
    if snippet:
        return f"status={exc.code} body={snippet}"
    return f"status={exc.code}"


def _post_json(url: str, payload: dict[str, Any], timeout_seconds: int) -> Any:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=timeout_seconds) as resp:
            raw = resp.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        raise RuntimeError(f"metabase_login_falhou {_decode_http_error(exc)}") from exc
    data = json.loads(raw or "{}")
    return data


def metabase_login(base_url: str, username: str, password: str, timeout_seconds: int) -> str:
    payload = _post_json(
        f"{base_url.rstrip('/')}/api/session",
        {"username": username, "password": password},
        timeout_seconds,
    )
    session_id = str(payload.get("id") or "").strip()
    if not session_id:
        raise RuntimeError("Metabase não retornou session id no login.")
    return session_id


def resolve_metabase_session(session_id: str = "", timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> str:
    provided = str(session_id or "").strip()
    if provided:
        return provided

    env_session, username, password = _load_metabase_backend_credentials()
    if env_session:
        return env_session

    if username and password:
        return metabase_login(DEFAULT_METABASE_URL, username, password, timeout_seconds)

    raise RuntimeError(
        "Credenciais do Metabase ausentes no backend. Defina MB_USER e MB_PASS no container ou salve .credentials/metabase.env."
    )


def _normalize_metabase_payload(payload: Any, card_id: int) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [row if isinstance(row, dict) else {"value": row} for row in payload]
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        return [row if isinstance(row, dict) else {"value": row} for row in payload["data"]]
    if (
        isinstance(payload, dict)
        and isinstance(payload.get("data"), dict)
        and isinstance(payload["data"].get("rows"), list)
        and isinstance(payload["data"].get("cols"), list)
    ):
        columns = [str((col or {}).get("name") or f"col_{idx}") for idx, col in enumerate(payload["data"]["cols"])]
        rows: list[dict[str, Any]] = []
        for raw_row in payload["data"]["rows"]:
            row_dict = {}
            for idx, name in enumerate(columns):
                row_dict[name] = raw_row[idx] if idx < len(raw_row) else None
            rows.append(row_dict)
        return rows
    raise RuntimeError(f"Formato inesperado de resposta do card {card_id}.")


def metabase_query_card(
    *,
    base_url: str,
    card_id: int,
    session_id: str,
    parameters: list[dict[str, Any]],
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> list[dict[str, Any]]:
    device_id = str(uuid.uuid4())
    encoded = urllib_parse.urlencode({"parameters": json.dumps(parameters or [], ensure_ascii=False)}).encode("utf-8")
    req = urllib_request.Request(
        f"{base_url.rstrip('/')}/api/card/{card_id}/query/json",
        data=encoded,
        headers={
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "Cookie": (
                f"metabase.DEVICE={device_id}; "
                'g_state={"i_l":0}; '
                "metabase.TIMEOUT=alive; "
                "metabase.SEEN_ALERT_SPLASH=true; "
                f"metabase.SESSION={session_id}"
            ),
            "Origin": base_url.rstrip("/"),
        },
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=timeout_seconds) as resp:
            raw = resp.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        raise RuntimeError(f"Erro ao consultar card {card_id}: {_decode_http_error(exc)}") from exc
    payload = json.loads(raw or "[]")
    return _normalize_metabase_payload(payload, card_id)


def fetch_card_823_rows(
    *,
    data_inicial: str,
    data_final: str,
    loja: str = "",
    cod_loja: str = "",
    session_id: str = "",
    base_url: str = DEFAULT_METABASE_URL,
    card_id: int = DEFAULT_CARD_ID,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> tuple[str, list[dict[str, Any]]]:
    result = fetch_card_823_rows_result(
        data_inicial=data_inicial,
        data_final=data_final,
        loja=loja,
        cod_loja=cod_loja,
        session_id=session_id,
        base_url=base_url,
        card_id=card_id,
        timeout_seconds=timeout_seconds,
    )
    return str(result.get("loja") or ""), list(result.get("rows") or [])


def fetch_card_823_rows_result(
    *,
    data_inicial: str,
    data_final: str,
    loja: str = "",
    cod_loja: str = "",
    session_id: str = "",
    base_url: str = DEFAULT_METABASE_URL,
    card_id: int = DEFAULT_CARD_ID,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    valid_initial = _validate_iso_date(data_inicial, "Data inicial")
    valid_final = _validate_iso_date(data_final, "Data final")
    if valid_initial > valid_final:
        raise ValueError("Data inicial não pode ser maior que a data final.")

    resolved_store = resolve_store_value(loja=loja, cod_loja=cod_loja)
    result = _fetch_rows_via_apps_script(
        data_inicial=valid_initial,
        data_final=valid_final,
        stores=[resolved_store],
        timeout_seconds=timeout_seconds,
    )
    rows = list(result.get("rows") or [])
    return {
        "loja": resolved_store,
        "rows": rows,
        "data_inicial": valid_initial,
        "data_final": valid_final,
        "data_inicial_effective": str(result.get("data_inicial_effective") or valid_initial),
        "data_final_effective": str(result.get("data_final_effective") or valid_final),
        "fallback_applied": bool(result.get("fallback_applied")),
        "fallback_reason": str(result.get("fallback_reason") or "").strip(),
        "fallback_date": str(result.get("data_inicial_effective") or valid_initial) if bool(result.get("fallback_applied")) else "",
    }


def validate_sales_rows(rows: list[dict[str, Any]], store_id: str, data_inicial: str, data_final: str) -> dict[str, Any]:
    start = datetime.strptime(data_inicial, "%Y-%m-%d").date()
    end = datetime.strptime(data_final, "%Y-%m-%d").date()
    outside_period = 0
    store_mismatch = 0
    expected_keywords = STORE_KEYWORDS_BY_ID.get(store_id, [])

    for row in rows:
        row_date = _parse_response_date(row.get("data_entrega"))
        if row_date and (row_date < start or row_date > end):
            outside_period += 1
        dark_store = _norm_text(row.get("dark_store"))
        if dark_store and expected_keywords and not any(keyword in dark_store for keyword in expected_keywords):
            store_mismatch += 1

    warnings: list[str] = []
    if outside_period:
        warnings.append(f"{outside_period} linha(s) fora do período solicitado")
    if store_mismatch:
        warnings.append(f"{store_mismatch} linha(s) com loja divergente na resposta")

    return {
        "raw_rows": len(rows),
        "outside_period_count": outside_period,
        "store_mismatch_count": store_mismatch,
        "warnings": warnings,
    }


def aggregate_sales_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        code = normalize_string(row.get("cod_produto") or row.get("product_code") or "").upper()
        if not code:
            continue
        description = normalize_string(row.get("nome") or row.get("desc_produto") or row.get("product_name") or "")
        qty = parse_number(row.get("total_vendido"))
        if qty is None:
            qty = parse_number(row.get("qtd_total"))
        if qty is None:
            qty = 0.0

        current = grouped.setdefault(
            code,
            {
                "cod_produto": code,
                "desc_produto": description,
                "qtd_total": 0.0,
            },
        )
        if description and not current.get("desc_produto"):
            current["desc_produto"] = description
        current["qtd_total"] = float(current.get("qtd_total") or 0.0) + float(qty)

    output: list[dict[str, Any]] = []
    for code in sorted(grouped.keys()):
        item = grouped[code]
        total = float(item.get("qtd_total") or 0.0)
        normalized_total: int | float = int(round(total)) if abs(total - round(total)) < 1e-9 else round(total, 4)
        output.append(
            {
                "cod_produto": item.get("cod_produto") or code,
                "desc_produto": item.get("desc_produto") or "",
                "qtd_total": normalized_total,
            }
        )
    return output


def write_vendas_alvo_sheet(master_sheet_id: str, rows: list[dict[str, Any]]) -> dict[str, Any]:
    client = GSheetsClient(master_sheet_id)
    values = [VENDAS_ALVO_HEADERS]
    for row in rows:
        values.append([row.get(header, "") for header in VENDAS_ALVO_HEADERS])
    client.clear_sheet(SHEET_VENDAS_ALVO)
    last_row = max(1, len(values))
    client.update_range(f"{SHEET_VENDAS_ALVO}!A1:C{last_row}", values)
    return {
        "sheet_name": SHEET_VENDAS_ALVO,
        "sheet_url": client.get_sheet_url(SHEET_VENDAS_ALVO),
        "rows_written": len(rows),
    }


def write_metabase_rows_to_xlsx(rows: list[dict[str, Any]], output_path: str | Path) -> Path:
    path = Path(output_path).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "vendas_por_dia"

    if not rows:
        worksheet.append(["status", "detalhe"])
        worksheet.append(["sem_dados", "Nenhum registro retornado pelo card 823."])
        workbook.save(path)
        return path

    headers: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for key in row.keys():
            key_str = str(key)
            if key_str in seen:
                continue
            seen.add(key_str)
            headers.append(key_str)

    worksheet.append(headers)
    for row in rows:
        worksheet.append([row.get(header) for header in headers])

    workbook.save(path)
    return path


def build_vendas_alvo_from_metabase(
    *,
    master_sheet_id: str,
    data_inicial: str,
    data_final: str,
    stores: list[str],
    session_id: str = "",
    base_url: str = DEFAULT_METABASE_URL,
    card_id: int = DEFAULT_CARD_ID,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    valid_initial = _validate_iso_date(data_inicial, "Data inicial")
    valid_final = _validate_iso_date(data_final, "Data final")
    if valid_initial > valid_final:
        raise ValueError("Data inicial não pode ser maior que a data final.")

    selected_stores = _normalize_store_ids(stores)
    if not selected_stores:
        raise ValueError("Selecione pelo menos uma loja para montar Vendas Alvo.")

    save_metabase_sales_context(data_inicial=valid_initial, data_final=valid_final, stores=selected_stores)

    result = _fetch_rows_via_apps_script(
        data_inicial=valid_initial,
        data_final=valid_final,
        stores=selected_stores,
        timeout_seconds=timeout_seconds,
    )
    all_rows = list(result.get("rows") or [])
    store_results: list[dict[str, Any]] = []
    rows_by_store: dict[str, list[dict[str, Any]]] = {}
    for row in all_rows:
        row_store = str(row.get("_requested_store") or "").strip()
        if not row_store:
            continue
        rows_by_store.setdefault(row_store, []).append(row)

    for store_id in selected_stores:
        validation = validate_sales_rows(rows_by_store.get(store_id, []), store_id, valid_initial, valid_final)
        store_results.append({"store_id": store_id, "store_label": STORE_LABEL_BY_ID.get(store_id, store_id), **validation})

    aggregated_rows = aggregate_sales_rows(all_rows)
    write_result = write_vendas_alvo_sheet(master_sheet_id, aggregated_rows)
    effective_initial = str(result.get("data_inicial_effective") or valid_initial)
    fallback_applied = bool(result.get("fallback_applied"))
    fallback_reason = str(result.get("fallback_reason") or "").strip()
    return {
        "success": True,
        "sheet_name": write_result["sheet_name"],
        "sheet_url": write_result["sheet_url"],
        "rows_written": write_result["rows_written"],
        "rows_fetched_raw": len(all_rows),
        "stores": selected_stores,
        "stores_labels": [STORE_LABEL_BY_ID.get(store_id, store_id) for store_id in selected_stores],
        "data_inicial": valid_initial,
        "data_final": valid_final,
        "data_inicial_effective": effective_initial,
        "data_final_effective": str(result.get("data_final_effective") or valid_final),
        "fallback_applied": fallback_applied,
        "fallback_reason": fallback_reason,
        "fallback_date": effective_initial if fallback_applied else "",
        "card_id": card_id,
        "store_results": store_results,
    }
