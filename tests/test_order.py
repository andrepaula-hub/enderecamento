from core.order import order_prancheta


def test_order_prancheta_groups_by_code_and_sales():
    all_product_data_map = {
        "A": {"venda_total": 100},
        "B": {"venda_total": 50},
    }
    products = [
        {"id": "1", "product_code": "B"},
        {"id": "2", "product_code": "A"},
        {"id": "3", "product_code": "A"},
        {"id": "4", "product_code": "B"},
    ]

    ordered = order_prancheta(products, all_product_data_map)
    ordered_codes = [p["product_code"] for p in ordered]

    assert ordered_codes == ["A", "A", "B", "B"]
    assert [p["id"] for p in ordered[:2]] == ["2", "3"]
    assert [p["id"] for p in ordered[2:]] == ["1", "4"]
