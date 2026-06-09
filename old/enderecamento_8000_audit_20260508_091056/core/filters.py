from __future__ import annotations

from typing import Any

from .utils import normalize_string, parse_bool_flag, parse_number


class FilterSpec:
    def __init__(
        self,
        query: str = "",
        selected_grupos: list[str] | None = None,
        selected_grupos2: list[str] | None = None,
        filter_tipo: str = "",
        filter_fragil: str = "",
        filter_degelo: str = "",
        filter_curva: str = "",
        selected_subcategorias: list[str] | None = None,
        filter_multiplos_escaninhos: str = "",
    ) -> None:
        self.query = normalize_string(query).lower()
        self.selected_grupos = selected_grupos or []
        self.selected_grupos2 = selected_grupos2 or []
        self.filter_tipo = normalize_string(filter_tipo)
        self.filter_fragil = normalize_string(filter_fragil)
        self.filter_degelo = normalize_string(filter_degelo)
        self.filter_curva = normalize_string(filter_curva)
        self.selected_subcategorias = selected_subcategorias or []
        self.filter_multiplos_escaninhos = normalize_string(filter_multiplos_escaninhos)


def _categoria_matches(categoria: str, filtro: str) -> bool:
    categoria = categoria.lower()
    filtro = filtro.lower()
    if filtro == "geladeira":
        return categoria == "refrigerado" or "geladeira" in categoria
    if filtro == "prateleira":
        return categoria == "seco" or "prateleira" in categoria
    if filtro == "freezer":
        return categoria == "congelado" or "freezer" in categoria
    return False


def _grupo_matches(grupo: str, filtro: str) -> bool:
    grupo = grupo.lower()
    filtro = filtro.lower()
    if filtro in {"flv", "flvs"}:
        return grupo in {"flv", "flvs"}
    if filtro == "bebidas":
        return grupo == "bebidas"
    if filtro == "alimento":
        return grupo == "alimento"
    if filtro in {"quimico", "quimicos"}:
        return grupo == "quimico"
    if filtro == "perfumaria":
        return grupo == "perfumaria"
    if filtro == "quimico_perfumaria":
        return grupo in {"quimico", "perfumaria"}
    if filtro == "neutro":
        return grupo == "neutro"
    return False


def _curva_final(curva_original: Any, nm_fabricante: Any) -> str:
    curva_text = normalize_string(curva_original)
    marca_text = normalize_string(nm_fabricante)
    if curva_text and len(curva_text) == 1 and not curva_text.isnumeric():
        return curva_text.upper()
    if marca_text and len(marca_text) == 1 and not marca_text.isnumeric() and curva_text and curva_text.isnumeric():
        return marca_text.upper()
    if curva_text:
        return curva_text.upper()
    return ""


def filter_products(
    products: list[dict[str, Any]],
    all_product_data_map: dict[str, dict[str, Any]],
    spec: FilterSpec,
    volumetria_map: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    filtered: list[dict[str, Any]] = []

    for product in products:
        if not product or not product.get("product_name"):
            continue
        name = normalize_string(product.get("product_name")).lower()
        code = normalize_string(product.get("product_code")).lower()
        if spec.query and spec.query not in name and spec.query not in code:
            continue

        full_product = all_product_data_map.get(normalize_string(product.get("product_code")), {})
        grupo = normalize_string(full_product.get("grupo") or product.get("grupo") or "neutro").lower()
        categoria_armz = normalize_string(
            full_product.get("categoria_armazenagem")
            or product.get("categoria_armazenagem")
            or product.get("cat_armz")
            or ""
        ).lower()

        if spec.selected_grupos:
            filtros_equip = []
            filtros_grupo = []
            for grupo_sel in spec.selected_grupos:
                g = normalize_string(grupo_sel).lower()
                if g in {"geladeira", "prateleira", "freezer"}:
                    filtros_equip.append(g)
                else:
                    filtros_grupo.append(g)

            if filtros_equip and not any(_categoria_matches(categoria_armz, f) for f in filtros_equip):
                continue
            if filtros_grupo and not any(_grupo_matches(grupo, f) for f in filtros_grupo):
                continue

        if spec.selected_grupos2:
            filtros_equip = []
            filtros_grupo = []
            for grupo_sel in spec.selected_grupos2:
                g = normalize_string(grupo_sel).lower()
                if g in {"geladeira", "prateleira", "freezer"}:
                    filtros_equip.append(g)
                else:
                    filtros_grupo.append(g)

            if filtros_equip and not any(_categoria_matches(categoria_armz, f) for f in filtros_equip):
                continue
            if filtros_grupo and not any(_grupo_matches(grupo, f) for f in filtros_grupo):
                continue

        if spec.filter_tipo:
            alto_value = full_product.get("is_alto") if "is_alto" in full_product else product.get("is_alto")
            pesado_value = full_product.get("is_pesado") if "is_pesado" in full_product else product.get("is_pesado")
            pequeno_value = full_product.get("is_pequeno") if "is_pequeno" in full_product else product.get("is_pequeno")
            is_alto = parse_bool_flag(alto_value)
            is_pesado = parse_bool_flag(pesado_value)
            is_pequeno = parse_bool_flag(pequeno_value)

            ft = spec.filter_tipo
            if ft == "alto" and not is_alto:
                continue
            if ft == "pesado" and not is_pesado:
                continue
            if ft == "pequeno" and not is_pequeno:
                continue
            if ft == "alto-pesado" and not (is_alto or is_pesado):
                continue
            if ft == "alto-e-pesado" and not (is_alto and is_pesado):
                continue
            if ft == "alto-e-pequeno" and not (is_alto and is_pequeno):
                continue
            if ft == "pesado-e-pequeno" and not (is_pesado and is_pequeno):
                continue
            if ft == "alto-ou-pequeno" and not (is_alto or is_pequeno):
                continue
            if ft == "pesado-ou-pequeno" and not (is_pesado or is_pequeno):
                continue
            if ft == "nao-alto" and is_alto:
                continue
            if ft == "nao-pesado" and is_pesado:
                continue
            if ft == "nao-pequeno" and is_pequeno:
                continue

        if spec.filter_fragil:
            is_fragil = normalize_string(full_product.get("is_fragil") or product.get("is_fragil")).upper()
            if spec.filter_fragil == "sim" and is_fragil != "SIM":
                continue
            if spec.filter_fragil == "nao" and is_fragil == "SIM":
                continue

        if spec.filter_degelo:
            degelo = normalize_string(full_product.get("degelo") or product.get("degelo")).upper()
            if spec.filter_degelo == "nao" and degelo != "NAO":
                continue
            if spec.filter_degelo == "pode" and degelo != "PODE":
                continue

        if spec.filter_curva:
            curva_final = _curva_final(full_product.get("curva") or product.get("curva"), full_product.get("nm_fabricante"))
            if spec.filter_curva == "sem":
                if curva_final:
                    continue
            elif "+" in spec.filter_curva:
                curvas = [c.strip().upper() for c in spec.filter_curva.split("+") if c.strip()]
                if curva_final not in curvas:
                    continue
            else:
                if curva_final != spec.filter_curva.upper():
                    continue

        if spec.selected_subcategorias:
            subcategoria = normalize_string(full_product.get("subcategoria") or product.get("subcategoria"))
            if subcategoria not in spec.selected_subcategorias:
                continue

        if spec.filter_multiplos_escaninhos:
            vol_total = parse_number(
                full_product.get("vol_L_total")
                or full_product.get("vol_l_total")
                or product.get("vol_L_total")
                or product.get("vol_l_total")
            ) or 0.0
            escaninhos = 1
            if vol_total > 0 and volumetria_map:
                categoria = normalize_string(
                    full_product.get("categoria_armazenagem")
                    or product.get("categoria_armazenagem")
                    or product.get("cat_armz")
                )
                tipo = ""
                categoria_lower = categoria.lower()
                if "geladeira" in categoria_lower or categoria_lower == "refrigerado":
                    tipo = "geladeira"
                elif "freezer" in categoria_lower or categoria_lower == "congelado":
                    tipo = "freezer"
                elif "prateleira" in categoria_lower or categoria_lower == "seco":
                    tipo = "prateleira"

                if tipo and tipo in volumetria_map:
                    volumetria = volumetria_map[tipo]
                    l_por = parse_number(volumetria.get("l_por_escaninho")) or 0
                    fator = parse_number(volumetria.get("fator_seguranca")) or 0
                    if l_por > 0 and fator > 0:
                        capacidade = l_por * fator
                        escaninhos = int((vol_total + capacidade - 1) // capacidade)
                        if escaninhos < 1:
                            escaninhos = 1

            if spec.filter_multiplos_escaninhos == "sim" and escaninhos <= 1:
                continue
            if spec.filter_multiplos_escaninhos == "nao" and escaninhos > 1:
                continue

        filtered.append(product)

    return filtered
