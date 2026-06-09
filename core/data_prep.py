from __future__ import annotations

from pathlib import Path
from typing import Any

from .excel_io import read_sheet
from .utils import parse_bool_flag, parse_number, normalize_string


SHEET_BASE_PRODUTOS = "Base_Produtos"
SHEET_DIC_CATEGORIAS = "Dicionario_Categorias"
SHEET_CONFIG_OPER = "Configuracoes_Operacionais"
SHEET_VOLUMETRIA = "Volumetria_Equipamentos"


def load_sheet_safe(source: Any, name: str) -> list[dict[str, Any]]:
    try:
        if hasattr(source, "read_sheet"):
            return source.read_sheet(name)
        return read_sheet(Path(source), name)
    except Exception:
        return []


def build_dic_cat_map(dic_data: list[dict[str, Any]]) -> dict[str, str]:
    dic_cat_map: dict[str, str] = {}
    for row in dic_data:
        key = normalize_string(row.get("categoria_site")).lower()
        if not key:
            continue
        grupo = normalize_string(row.get("grupo")).lower()
        if key:
            dic_cat_map[key] = grupo
    return dic_cat_map


def load_limits(config_oper_data: list[dict[str, Any]]) -> tuple[float, float, float]:
    limite_altura = None
    limite_peso = None
    limite_altura_baixo = None

    for row in config_oper_data:
        parametro = normalize_string(row.get("parametro")).lower()
        valor = row.get("valor") if row.get("valor") is not None else row.get("value")

        if parametro == "limite_altura_cm" or parametro == "limite altura cm" or (
            "altura" in parametro and "baixo" not in parametro and "baixa" not in parametro
        ):
            altura_val = parse_number(valor)
            if altura_val and altura_val > 0:
                limite_altura = altura_val

        if parametro == "limite_peso_kg" or parametro == "limite peso kg" or (
            "peso" in parametro and "total" not in parametro
        ):
            peso_val = parse_number(valor)
            if peso_val and peso_val > 0:
                limite_peso = peso_val

        if parametro == "limite_altura_cm_baixo" or parametro == "limite_altura_baixo":
            altura_baixo = parse_number(valor)
            if altura_baixo and altura_baixo > 0:
                limite_altura_baixo = altura_baixo

    if config_oper_data:
        config_row = config_oper_data[0]
        if limite_altura is None:
            limite_altura = parse_number(config_row.get("limite_altura_cm") or config_row.get("limite_altura"))
        if limite_peso is None:
            limite_peso = parse_number(config_row.get("limite_peso_kg") or config_row.get("limite_peso"))
        if limite_altura_baixo is None:
            limite_altura_baixo = parse_number(
                config_row.get("limite_altura_cm_baixo") or config_row.get("limite_altura_baixo")
            )

    if limite_altura is None:
        limite_altura = 28.0
    if limite_peso is None:
        limite_peso = 0.5
    if limite_altura_baixo is None:
        limite_altura_baixo = 12.5

    return float(limite_altura), float(limite_peso), float(limite_altura_baixo)


def build_base_produtos_map(
    base_produtos_data: list[dict[str, Any]],
    dic_cat_map: dict[str, str],
    limite_altura: float,
    limite_altura_baixo: float,
) -> dict[str, dict[str, Any]]:
    base_produtos_map: dict[str, dict[str, Any]] = {}

    for row in base_produtos_data:
        quantidade = parse_number(row.get("quantidade")) or 0.0
        if quantidade <= 0:
            continue
        cat_site = normalize_string(row.get("categoria_site")).lower()
        row["grupo"] = normalize_string(dic_cat_map.get(cat_site, "neutro")).lower()

        altura_val = parse_number(row.get("altura_cm")) or 0.0
        row["is_alto"] = bool(limite_altura and altura_val >= limite_altura)
        row["is_pequeno"] = bool(limite_altura_baixo and altura_val <= limite_altura_baixo)
        row["is_pesado"] = parse_bool_flag(row.get("is_pesado"))

        row["is_fragil"] = normalize_string(row.get("is_fragil")).upper()
        row["degelo"] = normalize_string(row.get("degelo")).upper()

        cat_arm = normalize_string(row.get("categoria_armazenagem")).lower()
        is_cold = "geladeira" in cat_arm or "freezer" in cat_arm or cat_arm in ("refrigerado", "congelado")
        is_lateral = "lateral" in cat_arm
        is_prateleira = not is_cold and not is_lateral

        def _cap_esc(max_val: int) -> None:
            esc_raw = normalize_string(row.get("escaninhos_necessarios")).replace(",", ".")
            if not esc_raw:
                return
            try:
                esc_num = int(float(esc_raw))
            except ValueError:
                return
            if esc_num > max_val:
                row["escaninhos_necessarios"] = max_val

        if "geladeira" in cat_arm and row["degelo"] == "PODE":
            _cap_esc(5)
        if is_prateleira:
            _cap_esc(7)

        product_code = normalize_string(row.get("product_code"))
        if product_code:
            base_produtos_map[product_code] = row

    return base_produtos_map


def load_volumetria_map(volumetria_data: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    volumetria_map: dict[str, dict[str, Any]] = {}
    for row in volumetria_data:
        tipo = normalize_string(row.get("tipo_equipamento")).lower()
        if not tipo:
            continue
        volumetria_map[tipo] = row
    return volumetria_map
