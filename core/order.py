from __future__ import annotations

from typing import Any

from .utils import parse_number, normalize_string


def order_prancheta(products: list[dict[str, Any]], all_product_data_map: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    indexed = list(products)

    def venda(product: dict[str, Any]) -> float:
        code = normalize_string(product.get("product_code"))
        data = all_product_data_map.get(code, {})
        return parse_number(data.get("venda_total")) or 0.0

    def sort_key(product: dict[str, Any]) -> tuple[float, str]:
        code = normalize_string(product.get("product_code"))
        return (-venda(product), code)

    indexed.sort(key=sort_key)

    code_groups: dict[str, list[dict[str, Any]]] = {}
    for product in indexed:
        code = normalize_string(product.get("product_code"))
        code_groups.setdefault(code, []).append(product)

    grouped: list[dict[str, Any]] = []
    processed = set()
    for product in indexed:
        code = normalize_string(product.get("product_code"))
        if code in processed:
            continue
        processed.add(code)
        grouped.extend(code_groups.get(code, [product]))

    return grouped
