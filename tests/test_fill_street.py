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


def test_fill_street_prefers_planned_degelo_equipment():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira", "niveis": 2, "escsPerNivel": 1, "cap": 100},
                {"id": "R1-E2", "tipo": "geladeira", "niveis": 2, "escsPerNivel": 1, "cap": 100},
            ],
        }
    ]
    allocations = {
        f"R1-E{equip}-{level}-1": {"p1": None, "p2": None}
        for equip in (1, 2)
        for level in range(1, 3)
    }

    result = fill_street_allocations(
        unallocated_codes=["MILK"],
        products_data=[
            _product(
                "MILK",
                nome="Leite refrigerado",
                arm="Geladeira",
                categoria_armazenagem="Geladeira",
                degelo="NÃO",
                escsNec=1,
                peso=0.5,
                pesado=False,
            )
        ],
        map_structure=map_structure,
        allocations=allocations,
        target_groups=[
            {"equipmentId": "R1-E1", "targets": ["R1-E1-2-1"]},
            {"equipmentId": "R1-E2", "targets": ["R1-E2-2-1"]},
        ],
        options={
            "allow_top_level": True,
            "whole_street": True,
            "degelo_preferred_equipment_ids": ["R1-E2"],
        },
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E2-2-1", "productCode": "MILK", "slot": 1, "equipmentId": "R1-E2"},
    ]


def test_fill_street_keeps_degelo_nao_together_before_opening_mixed_equipment():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira", "niveis": 2, "escsPerNivel": 1, "cap": 100},
                {"id": "R1-E2", "tipo": "geladeira", "niveis": 2, "escsPerNivel": 1, "cap": 100},
            ],
        }
    ]
    allocations = {
        "R1-E1-1-1": {"p1": "PODE1", "p2": None},
        "R1-E1-2-1": {"p1": None, "p2": None},
        "R1-E2-1-1": {"p1": "NAO1", "p2": None},
        "R1-E2-2-1": {"p1": None, "p2": None},
    }

    result = fill_street_allocations(
        unallocated_codes=["NAO2"],
        products_data=[
            _product("PODE1", arm="Geladeira", categoria_armazenagem="Geladeira", degelo="PODE", escsNec=1, peso=0.5, pesado=False),
            _product("NAO1", arm="Geladeira", categoria_armazenagem="Geladeira", degelo="NÃO", escsNec=1, peso=0.5, pesado=False),
            _product("NAO2", arm="Geladeira", categoria_armazenagem="Geladeira", degelo="NÃO", escsNec=1, peso=0.5, pesado=False),
        ],
        map_structure=map_structure,
        allocations=allocations,
        target_groups=[
            {"equipmentId": "R1-E1", "targets": ["R1-E1-2-1"]},
            {"equipmentId": "R1-E2", "targets": ["R1-E2-2-1"]},
        ],
        options={"allow_top_level": True, "whole_street": True},
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E2-2-1", "productCode": "NAO2", "slot": 1, "equipmentId": "R1-E2"},
    ]


def test_fill_street_keeps_degelo_pode_away_from_nao_equipment():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira", "niveis": 2, "escsPerNivel": 1, "cap": 100},
                {"id": "R1-E2", "tipo": "geladeira", "niveis": 2, "escsPerNivel": 1, "cap": 100},
            ],
        }
    ]
    allocations = {
        "R1-E1-1-1": {"p1": "PODE1", "p2": None},
        "R1-E1-2-1": {"p1": None, "p2": None},
        "R1-E2-1-1": {"p1": "NAO1", "p2": None},
        "R1-E2-2-1": {"p1": None, "p2": None},
    }

    result = fill_street_allocations(
        unallocated_codes=["PODE2"],
        products_data=[
            _product("PODE1", arm="Geladeira", categoria_armazenagem="Geladeira", degelo="PODE", escsNec=1, peso=0.5, pesado=False),
            _product("PODE2", arm="Geladeira", categoria_armazenagem="Geladeira", degelo="PODE", escsNec=1, peso=0.5, pesado=False),
            _product("NAO1", arm="Geladeira", categoria_armazenagem="Geladeira", degelo="NÃO", escsNec=1, peso=0.5, pesado=False),
        ],
        map_structure=map_structure,
        allocations=allocations,
        target_groups=[
            {"equipmentId": "R1-E1", "targets": ["R1-E1-2-1"]},
            {"equipmentId": "R1-E2", "targets": ["R1-E2-2-1"]},
        ],
        options={"allow_top_level": True, "whole_street": True},
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E1-2-1", "productCode": "PODE2", "slot": 1, "equipmentId": "R1-E1"},
    ]
