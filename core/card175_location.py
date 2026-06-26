"""Utilitários de mapeamento e normalização de endereços para o Card 175.

Funções puras sem dependências externas além de utils e stdlib.
Importadas por card175_snapshot.py — não importam de lá para evitar ciclo.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from .utils import normalize_string, parse_number


def _normalize_header(value: Any) -> str:
    text = normalize_string(value).strip().lower()
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def _find_index(headers: list[str], *aliases: str) -> int:
    aliases_norm = {_normalize_header(alias) for alias in aliases}
    for idx, header in enumerate(headers):
        if _normalize_header(header) in aliases_norm:
            return idx
    return -1


def _string_variants(value: Any, include_numeric: bool = True) -> set[str]:
    raw = normalize_string(value).upper()
    out: set[str] = set()
    if raw:
        out.add(raw)
        out.add(raw.lstrip("0") or "0")
        if raw.startswith("R") and raw[1:].isdigit():
            out.add(raw[1:].lstrip("0") or "0")
    if include_numeric:
        numeric_like = bool(re.fullmatch(r"[A-Z]?\d+", raw))
        num = parse_number(value)
        if num is not None and (numeric_like or raw.isdigit()):
            int_num = int(round(num))
            out.add(str(int_num))
            out.add(f"{int_num:03d}")
            out.add(f"R{int_num}")
    return {item for item in out if item}


def _register_addr_mapping(
    addr_map: dict[str, str],
    location_id: str,
    galpao: Any,
    rua: Any,
    posicao: Any,
    escaninho: Any,
) -> None:
    loc = normalize_string(location_id).strip()
    gal = normalize_string(galpao).upper().strip()
    if not loc or not gal:
        return
    ruas = _string_variants(rua, include_numeric=True) or {normalize_string(rua).upper()}
    posicoes = _string_variants(posicao, include_numeric=True) or {normalize_string(posicao).upper()}
    escaninhos = _string_variants(escaninho, include_numeric=False) or {normalize_string(escaninho).upper()}
    for rua_val in ruas:
        for pos_val in posicoes:
            for esc_val in escaninhos:
                key = f"{gal}|{rua_val}|{pos_val}|{esc_val}"
                addr_map.setdefault(key, loc)


def _extract_location_parts(location_id: str) -> tuple[str, str, str, str] | None:
    text = normalize_string(location_id).upper()
    match = re.match(r"^([A-Z0-9_]+)-R([A-Z0-9]+)-(?:E)?(\d+)-(.+)$", text)
    if not match:
        return None
    galpao = match.group(1)
    rua = match.group(2)
    pos = match.group(3)
    esc = match.group(4)
    return galpao, rua, pos, esc


def _letters_to_index(value: str) -> int | None:
    text = normalize_string(value).upper()
    if not text or not re.fullmatch(r"[A-Z]+", text):
        return None
    total = 0
    for ch in text:
        total = total * 26 + (ord(ch) - 64)
    return total


def _parse_slot_suffix(value: Any) -> tuple[int | None, int | None, str]:
    text = normalize_string(value).upper()
    if not text:
        return None, None, ""
    match = re.match(r"^(\d+)([A-Z]+)$", text)
    if not match:
        return None, None, text
    level = int(match.group(1))
    slot_letters = match.group(2)
    slot_num = _letters_to_index(slot_letters)
    return level, slot_num, text


def _build_virtual_location_id(galpao: str, rua: Any, posicao: Any, escaninho: Any) -> str | None:
    gal = normalize_string(galpao).upper()
    rua_num = parse_number(rua)
    equip_num = parse_number(posicao)
    _level, _slot_num, esc_text = _parse_slot_suffix(escaninho)
    if not gal or rua_num is None or equip_num is None or not esc_text:
        return None
    return f"{gal}-R{int(round(rua_num))}-{int(round(equip_num)):03d}-{esc_text}"


def _build_virtual_template_row(
    headers: list[str],
    location_id: str,
    group: dict[str, Any],
    equipment_template: list[Any] | None,
) -> list[Any]:
    row = list(equipment_template[: len(headers)]) if equipment_template else [""] * len(headers)
    row.extend([""] * (len(headers) - len(row)))

    galpao, rua, posicao, escaninho = _extract_location_parts(location_id) or ("", "", "", "")
    nivel_num, escaninho_num, esc_text = _parse_slot_suffix(escaninho)

    for idx, header in enumerate(headers):
        key = _normalize_header(header)
        if key == "location_id":
            row[idx] = location_id
        elif key == "galpao_id":
            row[idx] = galpao
        elif key == "rua_num":
            row[idx] = int(rua) if rua.isdigit() else rua
        elif key == "equipamento_num":
            row[idx] = int(posicao) if posicao.isdigit() else row[idx]
        elif key == "nivel":
            row[idx] = nivel_num if nivel_num is not None else row[idx]
        elif key == "escaninho_num_no_nivel":
            row[idx] = escaninho_num if escaninho_num is not None else row[idx]
        elif key in {"product_code", "produto_alocado_code"}:
            row[idx] = "Vazio"
        elif key == "product_name":
            row[idx] = ""
        elif key == "quantidade":
            row[idx] = 0
        elif key == "slot_duplo":
            row[idx] = "NAO"
        elif key == "location_id_atual":
            row[idx] = location_id
        elif key == "grupo_alocado":
            row[idx] = ""

    inferred_tipo = normalize_string(group.get("tipo_equipamento_final") or group.get("tipo_equipamento")).strip()
    if not inferred_tipo:
        inferred_tipo = "desconhecido"

    if not equipment_template:
        for idx, header in enumerate(headers):
            key = _normalize_header(header)
            if key == "tipo_equipamento":
                row[idx] = inferred_tipo
            elif key == "tipo_equipamento_final":
                row[idx] = inferred_tipo
            elif key == "capacidade_l":
                row[idx] = 0
            elif key in {"is_hot_zone", "is_nivel_alto", "is_nivel_inferior", "is_realocado", "is_pesado", "is_alto"}:
                row[idx] = False

    return row
