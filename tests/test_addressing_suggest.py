from backend.application.addressing.suggest_allocations import suggest_allocations


def _map_structure(levels=5):
    return [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "prateleira", "niveis": levels, "escsPerNivel": 1, "cap": 100},
            ],
        }
    ]


def _geladeira_map_structure(levels=4, escs_per_nivel=5):
    return [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira", "niveis": levels, "escsPerNivel": escs_per_nivel, "cap": 100},
            ],
        }
    ]


def _empty_allocations(levels=5):
    return {f"R1-E1-{level}-1": {"p1": None, "p2": None} for level in range(1, levels + 1)}


def _empty_allocations_grid(levels=4, escs_per_nivel=5):
    return {
        f"R1-E1-{level}-{pos}": {"p1": None, "p2": None}
        for level in range(1, levels + 1)
        for pos in range(1, escs_per_nivel + 1)
    }


def _product(code, **overrides):
    base = {
        "id": code,
        "nome": code,
        "grupo": "",
        "sub": "Mercearia",
        "curva": "B",
        "peso": 0,
        "vol": 1,
        "qtd": 1,
        "escsNec": 1,
        "pesado": False,
        "fragil": False,
        "alto": False,
        "pequeno": False,
        "arm": "seco",
        "degelo": "",
    }
    base.update(overrides)
    return base


def test_suggest_allocations_prioritizes_restricted_products_first():
    result = suggest_allocations(
        unallocated_codes=["LEVE", "PESADO"],
        products_data=[
            _product("LEVE", nome="Produto leve"),
            _product("PESADO", nome="Produto pesado", pesado=True, peso=3.5),
        ],
        map_structure=_map_structure(levels=4),
        allocations=_empty_allocations(levels=4),
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E1-4-1", "productCode": "PESADO", "slot": 1},
        {"escaninhoId": "R1-E1-1-1", "productCode": "LEVE", "slot": 1},
    ]


def test_suggest_allocations_blocks_flv_on_top_and_bottom_dynamic_levels():
    result = suggest_allocations(
        unallocated_codes=["FLV1"],
        products_data=[_product("FLV1", nome="Banana", grupo="FLV")],
        map_structure=_map_structure(levels=4),
        allocations=_empty_allocations(levels=4),
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"][0]["escaninhoId"] in {"R1-E1-2-1", "R1-E1-3-1"}


def test_suggest_allocations_respects_egg_middle_levels_rule():
    result = suggest_allocations(
        unallocated_codes=["OVO1"],
        products_data=[_product("OVO1", nome="Ovos brancos")],
        map_structure=_map_structure(levels=5),
        allocations=_empty_allocations(levels=5),
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"][0]["escaninhoId"] in {"R1-E1-2-1", "R1-E1-3-1", "R1-E1-4-1"}


def test_suggest_allocations_blocks_flv_on_geladeira_walls():
    result = suggest_allocations(
        unallocated_codes=["FLV1"],
        products_data=[_product("FLV1", nome="Uva", grupo="FLV", arm="refrigerado")],
        map_structure=_geladeira_map_structure(levels=4, escs_per_nivel=5),
        allocations=_empty_allocations_grid(levels=4, escs_per_nivel=5),
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"][0]["escaninhoId"] not in {
        "R1-E1-1-1", "R1-E1-1-5",
        "R1-E1-2-1", "R1-E1-2-5",
        "R1-E1-3-1", "R1-E1-3-5",
        "R1-E1-4-1", "R1-E1-4-5",
    }
