from core.filters import FilterSpec, filter_products


def test_filters_by_group_and_type_and_curva():
    all_product_data_map = {
        "P1": {
            "grupo": "alimento",
            "categoria_armazenagem": "refrigerado",
            "is_alto": True,
            "is_pesado": True,
            "is_pequeno": False,
            "is_fragil": "SIM",
            "degelo": "NAO",
            "curva": "A",
            "nm_fabricante": "",
        },
        "P2": {
            "grupo": "bebidas",
            "categoria_armazenagem": "seco",
            "is_alto": False,
            "is_pesado": False,
            "is_pequeno": True,
            "is_fragil": "NAO",
            "degelo": "PODE",
            "curva": "2",
            "nm_fabricante": "B",
        },
        "P3": {
            "grupo": "neutro",
            "categoria_armazenagem": "freezer",
            "is_alto": False,
            "is_pesado": True,
            "is_pequeno": False,
            "is_fragil": "SIM",
            "degelo": "NAO",
            "curva": "",
            "nm_fabricante": "",
        },
    }

    products = [
        {"product_code": "P1", "product_name": "Produto 1"},
        {"product_code": "P2", "product_name": "Produto 2"},
        {"product_code": "P3", "product_name": "Produto 3"},
    ]

    spec = FilterSpec(selected_grupos=["geladeira"])
    result = filter_products(products, all_product_data_map, spec)
    assert [p["product_code"] for p in result] == ["P1"]

    spec = FilterSpec(selected_grupos=["alimento"])
    result = filter_products(products, all_product_data_map, spec)
    assert [p["product_code"] for p in result] == ["P1"]

    spec = FilterSpec(filter_tipo="alto-e-pesado")
    result = filter_products(products, all_product_data_map, spec)
    assert [p["product_code"] for p in result] == ["P1"]

    spec = FilterSpec(filter_fragil="sim")
    result = filter_products(products, all_product_data_map, spec)
    assert set(p["product_code"] for p in result) == {"P1", "P3"}

    spec = FilterSpec(filter_degelo="nao")
    result = filter_products(products, all_product_data_map, spec)
    assert set(p["product_code"] for p in result) == {"P1", "P3"}

    spec = FilterSpec(filter_curva="A")
    result = filter_products(products, all_product_data_map, spec)
    assert [p["product_code"] for p in result] == ["P1"]

    spec = FilterSpec(filter_curva="B")
    result = filter_products(products, all_product_data_map, spec)
    assert [p["product_code"] for p in result] == ["P2"]
