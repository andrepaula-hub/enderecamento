from __future__ import annotations

import json
import os
import re
import ssl
import unicodedata
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

from openpyxl import Workbook

from .gsheets_client import CREDENTIALS_DIR, GSheetsClient
from .utils import normalize_string, parse_number

DEFAULT_METABASE_URL = str(os.getenv("METABASE_URL", "https://metabase.kdabra.com.br")).strip()
DEFAULT_CARD_ID = 823
DEFAULT_TIMEOUT_SECONDS = 180
METABASE_EARLIEST_DATE = "2020-01-01"
SHEET_VENDAS_ALVO = "Vendas Alvo"
VENDAS_ALVO_HEADERS = ["cod_produto", "desc_produto", "qtd_total"]
METABASE_CONTEXT_PATH = CREDENTIALS_DIR / "metabase_sales_context.json"
METABASE_ENV_PATH = CREDENTIALS_DIR / "metabase.env"
METABASE_CREDENTIALS_JSON_PATH = CREDENTIALS_DIR / "metabase_credentials.json"
METABASE_STORES_CACHE_PATH = CREDENTIALS_DIR / "metabase_stores_cache.json"
STORES_CACHE_TTL_HOURS = 12
STORES_CACHE_SCHEMA_VERSION = 2

STORE_OPTIONS: list[dict[str, str]] = [
    {"value": "altoDePinheiros", "label": "Alto de Pinheiros"},
    {"value": "barraFunda", "label": "Barra Funda"},
    {"value": "brooklin", "label": "Brooklin"},
    {"value": "campinas", "label": "Campinas"},
    {"value": "higienopolis", "label": "Higienópolis"},
    {"value": "ibirapuera", "label": "Ibirapuera"},
    {"value": "moema", "label": "Moema"},
    {"value": "morumbi", "label": "Morumbi"},
    {"value": "pamplona", "label": "Jardins / Pamplona"},
    {"value": "pinheiros", "label": "Pinheiros"},
    {"value": "saoCaetanoDoSul", "label": "São Caetano do Sul"},
    {"value": "tatupae", "label": "Tatuapé"},
    {"value": "vilaGuilherme", "label": "Vila Guilherme", "query_value": "Vila Guilherme"},
    {"value": "vilaMariana", "label": "Vila Mariana"},
    {"value": "vilaOlimpia", "label": "Vila Olímpia"},
]

STORE_LABEL_BY_ID = {item["value"]: item["label"] for item in STORE_OPTIONS}
STORE_CODE_TO_METABASE_LOJA = {
    "LJ060001": "pamplona",
    "LJ180001": "campinas",
    "LJ210001": "vilaGuilherme",
}
STORE_KEYWORDS_BY_ID = {
    "altoDePinheiros": ["alto de pinheiros"],
    "barraFunda": ["barra funda"],
    "brooklin": ["brooklin"],
    "campinas": ["campinas"],
    "higienopolis": ["higienopolis"],
    "ibirapuera": ["ibirapuera"],
    "moema": ["moema"],
    "morumbi": ["morumbi"],
    "pamplona": ["jardins"],
    "pinheiros": ["dark store pinheiros"],  # específico para não colidir com alto de pinheiros
    "saoCaetanoDoSul": ["sao caetano do sul"],
    "tatupae": ["tatuape"],
    "vilaGuilherme": ["vila guilherme"],
    "vilaMariana": ["vila mariana"],
    "vilaOlimpia": ["vila olimpia"],
}

CARD175_CARD_ID = 788
CARD175_STORE_CODE_BY_ID = {
    "pamplona": "6",
    "pinheiros": "LJ090001",
    "higienopolis": "LJ100001",
    "vilaOlimpia": "LJ110001",
    "altoDePinheiros": "LJ120001",
    "barraFunda": "LJ130001",
    "morumbi": "LJ140001",
    "vilaMariana": "LJ150001",
    "brooklin": "LJ160001",
    "campinas": "LJ180001",
    "vilaGuilherme": "LJ210001",
}


def _strip_accents(text: str) -> str:
    normalized = unicodedata.normalize("NFD", str(text or ""))
    return "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")


def _norm_text(value: Any) -> str:
    return " ".join(_strip_accents(str(value or "")).strip().lower().split())


def _store_value_from_label(label: str) -> str:
    words = re.findall(r"[a-z0-9]+", _norm_text(label))
    if not words:
        return ""
    return words[0] + "".join(word[:1].upper() + word[1:] for word in words[1:])


def _display_store_label(value: Any) -> str:
    text = normalize_string(value).strip()
    text = re.sub(r"(?i)^\s*(dark\s*store|loja)\s+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or normalize_string(value).strip()


def _store_keywords_for_options(available_stores: list[dict[str, str]] | None = None) -> dict[str, list[str]]:
    keywords = {store_id: list(values) for store_id, values in STORE_KEYWORDS_BY_ID.items()}
    for option in available_stores or []:
        store_id = str(option.get("value") or "").strip()
        if not store_id:
            continue
        values = keywords.setdefault(store_id, [])
        for key in ("query_value", "label", "value"):
            normalized = _norm_text(option.get(key))
            if normalized and normalized not in values:
                values.append(normalized)
    return keywords


def _store_option_from_dark_store(raw_dark_store: Any) -> dict[str, str] | None:
    raw = normalize_string(raw_dark_store).strip()
    normalized = _norm_text(raw)
    if not normalized:
        return None

    known_keywords = _store_keywords_for_options(STORE_OPTIONS)
    for store_id, keywords in known_keywords.items():
        if any(keyword and keyword in normalized for keyword in keywords):
            option = {
                "value": store_id,
                "label": STORE_LABEL_BY_ID.get(store_id, _display_store_label(raw)),
            }
            if raw:
                option["query_value"] = raw
            return option

    label = _display_store_label(raw)
    value = _store_value_from_label(label)
    if not value:
        return None
    return {"value": value, "label": label, "query_value": raw}


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


def _normalize_store_ids(raw_stores: Any, available_stores: list[dict[str, str]] | None = None) -> list[str]:
    known = {str(item.get("value") or "").strip() for item in (available_stores or STORE_OPTIONS)}
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
    available_stores = _fetch_store_options_from_metabase()
    stores = _normalize_store_ids(context.get("stores"), available_stores) or [item["value"] for item in available_stores]
    return {
        "data_inicial": default_initial,
        "data_final": default_final,
        "stores": stores,
        "available_stores": available_stores,
        "earliest_date": METABASE_EARLIEST_DATE,
        "base_url": DEFAULT_METABASE_URL,
        "card_id": DEFAULT_CARD_ID,
    }


def save_metabase_sales_context(
    *,
    data_inicial: str,
    data_final: str,
    stores: list[str],
) -> dict[str, Any]:
    available_stores = _fetch_store_options_from_metabase()
    payload = {"stores": _normalize_store_ids(stores, available_stores)}
    _save_context(payload)
    return get_metabase_sales_context()


def _load_metabase_backend_credentials() -> tuple[str, str, str]:
    session_id = str(os.getenv("MB_SESSION_ID", "")).strip()
    username = str(os.getenv("METABASE_USERNAME") or os.getenv("MB_USER", "")).strip()
    password = str(os.getenv("METABASE_PASSWORD") or os.getenv("MB_PASS", "")).strip()
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
                elif key in {"METABASE_USERNAME", "MB_USER"} and not username:
                    username = value
                elif key in {"METABASE_PASSWORD", "MB_PASS"} and not password:
                    password = value
        except Exception:
            pass

    if (not session_id) and (not (username and password)) and METABASE_CREDENTIALS_JSON_PATH.exists():
        try:
            payload = json.loads(METABASE_CREDENTIALS_JSON_PATH.read_text(encoding="utf-8"))
            session_id = session_id or str(payload.get("MB_SESSION_ID") or payload.get("session_id") or "").strip()
            username = username or str(
                payload.get("METABASE_USERNAME") or payload.get("MB_USER") or payload.get("username") or ""
            ).strip()
            password = password or str(
                payload.get("METABASE_PASSWORD") or payload.get("MB_PASS") or payload.get("password") or ""
            ).strip()
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


def _assign_store_to_rows(
    rows: list[dict[str, Any]],
    stores: list[str],
    available_stores: list[dict[str, str]] | None = None,
) -> list[dict[str, Any]]:
    """Atribui _requested_store a cada row com base nos keywords, do mais específico ao menos."""
    keywords_by_id = _store_keywords_for_options(available_stores)
    ordered = sorted(
        stores,
        key=lambda s: max((len(kw) for kw in keywords_by_id.get(s, [s])), default=0),
        reverse=True,
    )
    result = []
    for row in rows:
        dark = _norm_text(row.get("dark_store") or "")
        if not dark:
            continue
        for store_id in ordered:
            keywords = keywords_by_id.get(store_id, [_norm_text(store_id)])
            if any(kw in dark for kw in keywords):
                row["_requested_store"] = store_id
                result.append(row)
                break
    return result


def _fetch_rows_directly(
    *,
    data_inicial: str,
    data_final: str,
    stores: list[str],
    available_stores: list[dict[str, str]] | None = None,
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Busca dados do card 823 direto do Metabase sem filtro de Loja, filtra em Python."""
    if available_stores is None:
        available_stores = _read_stores_cache(allow_stale=True)
    session_id = resolve_metabase_session(timeout_seconds=timeout_seconds)
    params = [
        {"type": "date/single", "value": data_inicial, "target": ["variable", ["template-tag", "data_inicial"]]},
        {"type": "date/single", "value": data_final, "target": ["variable", ["template-tag", "data_final"]]},
    ]
    all_rows = metabase_query_card_with_auth_retry(
        base_url=DEFAULT_METABASE_URL,
        card_id=DEFAULT_CARD_ID,
        session_id=session_id,
        parameters=params,
        timeout_seconds=timeout_seconds,
    )
    filtered = _assign_store_to_rows(all_rows, stores, available_stores)
    return {
        "rows": filtered,
        "data_inicial_effective": data_inicial,
        "data_final_effective": data_final,
        "fallback_applied": False,
        "fallback_reason": "",
    }


def _fetch_rows_via_apps_script(
    *,
    data_inicial: str,
    data_final: str,
    stores: list[str],
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Compatibilidade: o fluxo de Vendas Alvo não usa mais Apps Script."""
    return _fetch_rows_directly(
        data_inicial=data_inicial,
        data_final=data_final,
        stores=stores,
        timeout_seconds=timeout_seconds,
    )


def _read_stores_cache(*, allow_stale: bool = False) -> list[dict[str, str]] | None:
    """Lê o cache de lojas se ele existir e for válido (< STORES_CACHE_TTL_HOURS horas)."""
    if not METABASE_STORES_CACHE_PATH.exists():
        return None
    try:
        payload = json.loads(METABASE_STORES_CACHE_PATH.read_text(encoding="utf-8"))
        if int(payload.get("schema_version") or 0) != STORES_CACHE_SCHEMA_VERSION:
            return None
        cached_at = datetime.fromisoformat(str(payload.get("cached_at") or ""))
        age_hours = (datetime.now() - cached_at).total_seconds() / 3600
        if age_hours > STORES_CACHE_TTL_HOURS and not allow_stale:
            return None
        stores = payload.get("stores")
        if isinstance(stores, list) and stores:
            return stores
    except Exception:
        pass
    return None


def _write_stores_cache(stores: list[dict[str, str]]) -> None:
    try:
        METABASE_STORES_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        METABASE_STORES_CACHE_PATH.write_text(
            json.dumps(
                {
                    "schema_version": STORES_CACHE_SCHEMA_VERSION,
                    "cached_at": datetime.now().isoformat(),
                    "stores": stores,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except Exception:
        pass


def _fetch_store_options_from_metabase(timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> list[dict[str, str]]:
    """Descobre lojas reais pelo card 823; cache é apenas fallback se a consulta falhar."""
    try:
        today = date.today()
        session_id = resolve_metabase_session(timeout_seconds=timeout_seconds)
        rows = metabase_query_card_with_auth_retry(
            base_url=DEFAULT_METABASE_URL,
            card_id=DEFAULT_CARD_ID,
            session_id=session_id,
            parameters=[
                {
                    "type": "date/single",
                    "value": (today - timedelta(days=30)).isoformat(),
                    "target": ["variable", ["template-tag", "data_inicial"]],
                },
                {
                    "type": "date/single",
                    "value": today.isoformat(),
                    "target": ["variable", ["template-tag", "data_final"]],
                },
            ],
            timeout_seconds=timeout_seconds,
        )
        by_id: dict[str, dict[str, str]] = {}
        for row in rows:
            option = _store_option_from_dark_store(row.get("dark_store"))
            if not option:
                continue
            store_id = str(option.get("value") or "").strip()
            if not store_id:
                continue
            by_id.setdefault(store_id, option)
        if not by_id:
            raise RuntimeError("Card 823 não retornou lojas em dark_store nos últimos 30 dias.")
        stores = sorted(by_id.values(), key=lambda item: _norm_text(item.get("label")))
        _write_stores_cache(stores)
        return stores
    except Exception:
        return _read_stores_cache(allow_stale=True) or list(STORE_OPTIONS)


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
        with urllib_request.urlopen(req, timeout=timeout_seconds, context=_SSL_CTX) as resp:
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
        "Não foi possível autenticar no Metabase. Verifique METABASE_USERNAME/METABASE_PASSWORD ou MB_USER/MB_PASS."
    )


def _is_metabase_auth_error(exc: Exception) -> bool:
    text = str(exc or "").lower()
    return "status=401" in text or "unauthenticated" in text or "unauthorized" in text


def _resolve_fresh_metabase_session(timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS) -> str:
    """Renova sessão ignorando MB_SESSION_ID local, que pode expirar."""
    _, username, password = _load_metabase_backend_credentials()

    if username and password:
        return metabase_login(DEFAULT_METABASE_URL, username, password, timeout_seconds)

    raise RuntimeError(
        "Sessão do Metabase expirou e não consegui renovar. Verifique METABASE_USERNAME/METABASE_PASSWORD ou MB_USER/MB_PASS."
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
        with urllib_request.urlopen(req, timeout=timeout_seconds, context=_SSL_CTX) as resp:
            raw = resp.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        raise RuntimeError(f"Erro ao consultar card {card_id}: {_decode_http_error(exc)}") from exc
    payload = json.loads(raw or "[]")
    return _normalize_metabase_payload(payload, card_id)


def metabase_query_card_with_auth_retry(
    *,
    base_url: str,
    card_id: int,
    session_id: str,
    parameters: list[dict[str, Any]],
    timeout_seconds: int = DEFAULT_TIMEOUT_SECONDS,
) -> list[dict[str, Any]]:
    try:
        return metabase_query_card(
            base_url=base_url,
            card_id=card_id,
            session_id=session_id,
            parameters=parameters,
            timeout_seconds=timeout_seconds,
        )
    except RuntimeError as exc:
        if not _is_metabase_auth_error(exc):
            raise

        refreshed_session = _resolve_fresh_metabase_session(timeout_seconds=timeout_seconds)
        return metabase_query_card(
            base_url=base_url,
            card_id=card_id,
            session_id=refreshed_session,
            parameters=parameters,
            timeout_seconds=timeout_seconds,
        )


def extract_metabase_card_id(value: Any) -> int:
    text = str(value or "").strip()
    if not text:
        raise ValueError("Informe o link/ID do card do Metabase.")
    if text.isdigit():
        return int(text)
    patterns = [
        r"/question/(\d+)",
        r"/card/(\d+)",
        r"[?&]cardId=(\d+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return int(match.group(1))
    digits = re.findall(r"\d+", text)
    if len(digits) == 1:
        return int(digits[0])
    raise ValueError("Não consegui extrair o ID do card do Metabase a partir do link informado.")


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

    available_stores = _fetch_store_options_from_metabase(timeout_seconds=timeout_seconds)
    selected_stores = _normalize_store_ids(stores, available_stores)
    if not selected_stores:
        raise ValueError("Selecione pelo menos uma loja para montar Vendas Alvo.")

    save_metabase_sales_context(data_inicial=valid_initial, data_final=valid_final, stores=selected_stores)

    result = _fetch_rows_directly(
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

    label_by_id = {
        str(item.get("value") or ""): str(item.get("label") or item.get("value") or "")
        for item in available_stores
    }
    for store_id in selected_stores:
        validation = validate_sales_rows(rows_by_store.get(store_id, []), store_id, valid_initial, valid_final)
        store_results.append({"store_id": store_id, "store_label": label_by_id.get(store_id, store_id), **validation})

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
        "stores_labels": [label_by_id.get(store_id, store_id) for store_id in selected_stores],
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
