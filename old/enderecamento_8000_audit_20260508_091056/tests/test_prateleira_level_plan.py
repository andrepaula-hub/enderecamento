from core.initial_data import _compute_prateleira_level_plan


def _equip_caps():
    return [
        {"equipId": "R1-E1", "tipo": "prateleira", "bins_1_3": 6, "bins_1_4": 8, "bins_all": 10},
        {"equipId": "R1-E2", "tipo": "prateleira", "bins_1_3": 6, "bins_1_4": 8, "bins_all": 10},
        {"equipId": "R1-E3", "tipo": "prateleira", "bins_1_3": 6, "bins_1_4": 8, "bins_all": 10},
        {"equipId": "R1-E4", "tipo": "prateleira", "bins_1_3": 6, "bins_1_4": 8, "bins_all": 10},
    ]


def test_prateleira_plan_needs_level_4_only():
    base_produtos_map = {
        "Q1": {
            "product_code": "Q1",
            "categoria_armazenagem": "Itens de prateleira",
            "grupo": "Quimicos",
            "escaninhos_necessarios": 9,
        },
        "N1": {
            "product_code": "N1",
            "categoria_armazenagem": "Itens de prateleira",
            "grupo": "Alimentos",
            "escaninhos_necessarios": 22,
        },
    }
    plan = _compute_prateleira_level_plan(_equip_caps(), base_produtos_map)
    non_quim = plan["non_quimico"]
    assert plan["quimico"]["fits"] is True
    assert non_quim["fits_3_levels"] is False
    assert non_quim["fits_4_levels"] is True
    assert non_quim["fits_5_levels"] is True
    assert non_quim["need_4_levels_count"] == 2
    assert non_quim["need_5_levels_count"] == 0


def test_prateleira_plan_needs_level_5():
    base_produtos_map = {
        "Q1": {
            "product_code": "Q1",
            "categoria_armazenagem": "Itens de prateleira",
            "grupo": "Quimicos",
            "escaninhos_necessarios": 9,
        },
        "N1": {
            "product_code": "N1",
            "categoria_armazenagem": "Itens de prateleira",
            "grupo": "Alimentos",
            "escaninhos_necessarios": 28,
        },
    }
    plan = _compute_prateleira_level_plan(_equip_caps(), base_produtos_map)
    non_quim = plan["non_quimico"]
    assert plan["quimico"]["fits"] is True
    assert non_quim["fits_3_levels"] is False
    assert non_quim["fits_4_levels"] is False
    assert non_quim["fits_5_levels"] is True
    assert non_quim["need_5_levels_count"] == 2
