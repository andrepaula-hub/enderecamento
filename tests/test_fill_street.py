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


def test_fill_street_curve_priority_prefers_earlier_equipment():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 1, "cap": 100},
                {"id": "R1-E2", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 1, "cap": 100},
            ],
        }
    ]
    allocations = {
        "R1-E1-1-1": {"p1": None, "p2": None},
        "R1-E2-1-1": {"p1": None, "p2": None},
    }

    result = fill_street_allocations(
        unallocated_codes=["CURVE_A"],
        products_data=[_product("CURVE_A", curva="A", escsNec=1, peso=0.5, pesado=False)],
        map_structure=map_structure,
        allocations=allocations,
        target_groups=[
            {"equipmentId": "R1-E1", "targets": ["R1-E1-1-1"]},
            {"equipmentId": "R1-E2", "targets": ["R1-E2-1-1"]},
        ],
        options={"allow_top_level": True, "whole_street": True},
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E1-1-1", "productCode": "CURVE_A", "slot": 1, "equipmentId": "R1-E1"},
    ]


def test_fill_street_curve_priority_keeps_same_curve_in_same_equipment():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "prateleira", "niveis": 2, "escsPerNivel": 1, "cap": 100},
                {"id": "R1-E2", "tipo": "prateleira", "niveis": 2, "escsPerNivel": 1, "cap": 100},
            ],
        }
    ]
    allocations = {
        "R1-E1-1-1": {"p1": None, "p2": None},
        "R1-E1-2-1": {"p1": None, "p2": None},
        "R1-E2-1-1": {"p1": "EXISTING_A", "p2": None},
        "R1-E2-2-1": {"p1": None, "p2": None},
    }

    result = fill_street_allocations(
        unallocated_codes=["NEXT_A"],
        products_data=[
            _product("EXISTING_A", curva="A", escsNec=1, peso=0.5, pesado=False),
            _product("NEXT_A", curva="A", escsNec=1, peso=0.5, pesado=False),
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
        {"escaninhoId": "R1-E2-2-1", "productCode": "NEXT_A", "slot": 1, "equipmentId": "R1-E2"},
    ]


def test_fill_street_keeps_cold_high_products_in_same_high_equipment():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira_alta", "niveis": 2, "escsPerNivel": 1, "cap": 100},
                {"id": "R1-E2", "tipo": "geladeira_alta", "niveis": 2, "escsPerNivel": 1, "cap": 100},
            ],
        }
    ]
    allocations = {
        "R1-E1-1-1": {"p1": None, "p2": None},
        "R1-E1-2-1": {"p1": None, "p2": None},
        "R1-E2-1-1": {"p1": "HIGH1", "p2": None},
        "R1-E2-2-1": {"p1": None, "p2": None},
    }

    result = fill_street_allocations(
        unallocated_codes=["HIGH2"],
        products_data=[
            _product("HIGH1", arm="Geladeira", categoria_armazenagem="Geladeira", alto=True, escsNec=1, peso=0.5, pesado=False),
            _product("HIGH2", arm="Geladeira", categoria_armazenagem="Geladeira", alto=True, escsNec=1, peso=0.5, pesado=False),
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
        {"escaninhoId": "R1-E2-2-1", "productCode": "HIGH2", "slot": 1, "equipmentId": "R1-E2"},
    ]


def test_fill_street_keeps_regular_cold_product_out_of_high_equipment_when_possible():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira", "niveis": 2, "escsPerNivel": 1, "cap": 100},
                {"id": "R1-E2", "tipo": "geladeira_alta", "niveis": 2, "escsPerNivel": 1, "cap": 100},
            ],
        }
    ]
    allocations = {
        "R1-E1-1-1": {"p1": None, "p2": None},
        "R1-E1-2-1": {"p1": None, "p2": None},
        "R1-E2-1-1": {"p1": "HIGH1", "p2": None},
        "R1-E2-2-1": {"p1": None, "p2": None},
    }

    result = fill_street_allocations(
        unallocated_codes=["REGULAR"],
        products_data=[
            _product("HIGH1", arm="Geladeira", categoria_armazenagem="Geladeira", alto=True, escsNec=1, peso=0.5, pesado=False),
            _product("REGULAR", arm="Geladeira", categoria_armazenagem="Geladeira", alto=False, escsNec=1, peso=0.5, pesado=False),
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
        {"escaninhoId": "R1-E1-2-1", "productCode": "REGULAR", "slot": 1, "equipmentId": "R1-E1"},
    ]


def test_fill_street_never_places_cold_high_product_in_regular_fridge():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira", "niveis": 1, "escsPerNivel": 1, "cap": 100},
            ],
        }
    ]
    allocations = {"R1-E1-1-1": {"p1": None, "p2": None}}

    result = fill_street_allocations(
        unallocated_codes=["HIGH"],
        products_data=[
            _product("HIGH", arm="Geladeira", categoria_armazenagem="Geladeira", alto=True, escsNec=1, peso=0.5, pesado=False),
        ],
        map_structure=map_structure,
        allocations=allocations,
        target_groups=[{"equipmentId": "R1-E1", "targets": ["R1-E1-1-1"]}],
        options={"allow_top_level": True, "whole_street": True},
    )

    assert result["success"] is True
    assert result["moves"] == []
    assert result["summary"]["remaining_codes"] == 1


def test_fill_street_reserves_high_fridge_until_high_products_are_consumed():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira", "niveis": 1, "escsPerNivel": 1, "cap": 100},
                {"id": "R1-E2", "tipo": "geladeira_alta", "niveis": 1, "escsPerNivel": 1, "cap": 100},
            ],
        }
    ]
    allocations = {
        "R1-E1-1-1": {"p1": None, "p2": None},
        "R1-E2-1-1": {"p1": None, "p2": None},
    }

    result = fill_street_allocations(
        unallocated_codes=["REGULAR_A", "HIGH_B"],
        products_data=[
            _product("REGULAR_A", arm="Geladeira", categoria_armazenagem="Geladeira", curva="A", escsNec=1, peso=0.5, pesado=False),
            _product("HIGH_B", arm="Geladeira", categoria_armazenagem="Geladeira", curva="B", alto=True, escsNec=1, peso=0.5, pesado=False),
        ],
        map_structure=map_structure,
        allocations=allocations,
        target_groups=[
            {"equipmentId": "R1-E1", "targets": ["R1-E1-1-1"]},
            {"equipmentId": "R1-E2", "targets": ["R1-E2-1-1"]},
        ],
        options={"allow_top_level": True, "whole_street": True},
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E2-1-1", "productCode": "HIGH_B", "slot": 1, "equipmentId": "R1-E2"},
        {"escaninhoId": "R1-E1-1-1", "productCode": "REGULAR_A", "slot": 1, "equipmentId": "R1-E1"},
    ]


def test_fill_street_relaxes_degelo_tier_when_strict_candidates_have_no_run():
    map_structure = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira", "niveis": 1, "escsPerNivel": 3, "cap": 100},
                {"id": "R1-E2", "tipo": "geladeira", "niveis": 1, "escsPerNivel": 2, "cap": 100},
            ],
        }
    ]
    allocations = {
        "R1-E1-1-1": {"p1": "PODE1", "p2": None},
        "R1-E1-1-2": {"p1": None, "p2": None},
        "R1-E1-1-3": {"p1": None, "p2": None},
        "R1-E2-1-1": {"p1": "NAO1", "p2": None},
        "R1-E2-1-2": {"p1": None, "p2": None},
    }

    result = fill_street_allocations(
        unallocated_codes=["NAO2", "NAO2"],
        products_data=[
            _product("PODE1", arm="Geladeira", categoria_armazenagem="Geladeira", degelo="PODE", escsNec=1, peso=0.5, pesado=False),
            _product("NAO1", arm="Geladeira", categoria_armazenagem="Geladeira", degelo="NÃO", escsNec=1, peso=0.5, pesado=False),
            _product("NAO2", arm="Geladeira", categoria_armazenagem="Geladeira", degelo="NÃO", escsNec=2, peso=0.5, pesado=False),
        ],
        map_structure=map_structure,
        allocations=allocations,
        target_groups=[
            {"equipmentId": "R1-E1", "targets": ["R1-E1-1-2", "R1-E1-1-3"]},
            {"equipmentId": "R1-E2", "targets": ["R1-E2-1-2"]},
        ],
        options={"allow_top_level": True, "whole_street": True},
    )

    assert result["success"] is True
    assert len(result["moves"]) == 2
