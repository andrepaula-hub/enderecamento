from backend.application.addressing.fill_street import fill_street_allocations


def _product(code, **overrides):
    base = {
        "id": code,
        "nome": code,
        "grupo": "Químico",
        "sub": "Limpeza",
        "curva": "A",
        "peso": 3.0,
        "vol": 1,
        "qtd": 1,
        "escsNec": 2,
        "pesado": True,
        "fragil": False,
        "alto": False,
        "pequeno": False,
        "arm": "seco",
        "degelo": "",
        "fabricante": "",
    }
    base.update(overrides)
    return base


def test_fill_street_whole_street_prefers_horizontal_run_in_another_equipment():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "prateleira", "niveis": 3, "escsPerNivel": 2, "cap": 100},
                {"id": "R1-E2", "tipo": "prateleira", "niveis": 3, "escsPerNivel": 2, "cap": 100},
            ],
        }
    ]
    allocations = {
        f"R1-E{equip}-{level}-{pos}": {"p1": None, "p2": None}
        for equip in (1, 2)
        for level in range(1, 4)
        for pos in range(1, 3)
    }

    result = fill_street_allocations(
        unallocated_codes=["DIABO", "DIABO"],
        products_data=[_product("DIABO", nome="Desentupidor Diabo Verde 1L")],
        map_structure=map_structure,
        allocations=allocations,
        target_groups=[
            {"equipmentId": "R1-E1", "targets": ["R1-E1-2-1", "R1-E1-3-1"]},
            {"equipmentId": "R1-E2", "targets": ["R1-E2-2-1", "R1-E2-2-2"]},
        ],
        options={"allow_top_level": True, "whole_street": True},
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E2-2-1", "productCode": "DIABO", "slot": 1, "equipmentId": "R1-E2"},
        {"escaninhoId": "R1-E2-2-2", "productCode": "DIABO", "slot": 1, "equipmentId": "R1-E2"},
    ]
    assert result["summary"]["mode"] == "whole_street"
