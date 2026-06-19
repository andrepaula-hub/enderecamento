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


def test_suggest_allocations_does_not_prioritize_heavy_products_beyond_top_level_block():
    result = suggest_allocations(
        unallocated_codes=["LEVE", "PESADO"],
        products_data=[
            _product("LEVE", nome="Produto leve"),
            _product("PESADO", nome="Produto pesado", pesado=True, peso=3.5, sub="Outra"),
        ],
        map_structure=_map_structure(levels=4),
        allocations=_empty_allocations(levels=4),
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E1-1-1", "productCode": "LEVE", "slot": 1},
        {"escaninhoId": "R1-E1-2-1", "productCode": "PESADO", "slot": 1},
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


def test_suggest_allocations_blocks_flv_on_dynamic_geladeira_walls():
    result = suggest_allocations(
        unallocated_codes=["FLV1"],
        products_data=[_product("FLV1", nome="Uva", grupo="FLV", arm="refrigerado")],
        map_structure=_geladeira_map_structure(levels=2, escs_per_nivel=3),
        allocations=_empty_allocations_grid(levels=2, escs_per_nivel=3),
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"][0]["escaninhoId"] in {"R1-E1-1-2", "R1-E1-2-2"}


def test_suggest_allocations_uses_aligned_stacked_fallback_when_same_level_does_not_fit():
    result = suggest_allocations(
        unallocated_codes=["FLV1"] * 4,
        products_data=[_product("FLV1", nome="Alface", grupo="FLV", arm="refrigerado", escsNec=4)],
        map_structure=_geladeira_map_structure(levels=2, escs_per_nivel=5),
        allocations=_empty_allocations_grid(levels=2, escs_per_nivel=5),
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert len(result["moves"]) == 4
    by_level = {}
    for move in result["moves"]:
        _, _, level, position = move["escaninhoId"].split("-")
        by_level.setdefault(int(level), []).append(int(position))
    assert sorted(len(positions) for positions in by_level.values()) == [1, 3]
    larger = max((sorted(positions) for positions in by_level.values()), key=len)
    smaller = min((sorted(positions) for positions in by_level.values()), key=len)
    assert larger == [2, 3, 4]
    assert smaller[0] in {2, 4}


def test_suggest_allocations_treats_repeated_queue_codes_as_missing_instances():
    result = suggest_allocations(
        unallocated_codes=["PAO1"] * 7,
        products_data=[_product("PAO1", nome="Pao Frances", escsNec=7)],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 4, "escsPerNivel": 7, "cap": 100},
                ],
            }
        ],
        allocations={
            f"R1-E1-{level}-{pos}": {"p1": None, "p2": None}
            for level in range(1, 5)
            for pos in range(1, 8)
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert len(result["moves"]) == 7
    assert result["summary"]["total_requested"] == 7


def test_suggest_allocations_caps_repeated_queue_codes_to_required_bins():
    result = suggest_allocations(
        unallocated_codes=["AGUA1"] * 20,
        products_data=[_product("AGUA1", nome="Agua Mineral", escsNec=5, arm="geladeira")],
        map_structure=_geladeira_map_structure(levels=5, escs_per_nivel=5),
        allocations=_empty_allocations_grid(levels=5, escs_per_nivel=5),
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert len(result["moves"]) == 5
    assert result["summary"]["total_requested"] == 5


def test_suggest_allocations_caps_repeated_queue_codes_by_remaining_bins():
    allocations = {
        **_empty_allocations_grid(levels=5, escs_per_nivel=5),
        "R1-E1-2-1": {"p1": "AGUA1", "p2": None},
        "R1-E1-2-2": {"p1": "AGUA1", "p2": None},
    }
    result = suggest_allocations(
        unallocated_codes=["AGUA1"] * 20,
        products_data=[_product("AGUA1", nome="Agua Mineral", escsNec=5, arm="geladeira")],
        map_structure=_geladeira_map_structure(levels=5, escs_per_nivel=5),
        allocations=allocations,
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert len(result["moves"]) == 3
    assert result["summary"]["total_requested"] == 3


def test_suggest_allocations_extends_existing_multibin_block_or_leaves_unallocated():
    result = suggest_allocations(
        unallocated_codes=["FLV1", "FLV1"],
        products_data=[_product("FLV1", nome="Salada Higienizada", grupo="FLV", arm="refrigerado", escsNec=4)],
        map_structure=_geladeira_map_structure(levels=4, escs_per_nivel=5),
        allocations={
            **_empty_allocations_grid(levels=4, escs_per_nivel=5),
            "R1-E1-1-2": {"p1": "FLV1", "p2": None},
            "R1-E1-1-3": {"p1": "FLV1", "p2": None},
            "R1-E1-1-4": {"p1": "OUTRO", "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == []
    assert result["unallocated"] == ["FLV1"]


def test_suggest_allocations_extends_existing_multibin_block_when_contiguous_space_exists():
    result = suggest_allocations(
        unallocated_codes=["FLV1"],
        products_data=[_product("FLV1", nome="Salada Higienizada", grupo="FLV", arm="refrigerado", escsNec=3)],
        map_structure=_geladeira_map_structure(levels=4, escs_per_nivel=5),
        allocations={
            **_empty_allocations_grid(levels=4, escs_per_nivel=5),
            "R1-E1-1-2": {"p1": "FLV1", "p2": None},
            "R1-E1-1-3": {"p1": "FLV1", "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E1-1-4", "productCode": "FLV1", "slot": 1},
    ]


def test_suggest_allocations_does_not_extend_flv_block_already_on_geladeira_wall():
    result = suggest_allocations(
        unallocated_codes=["FLV1"],
        products_data=[_product("FLV1", nome="Salada Higienizada", grupo="FLV", arm="refrigerado", escsNec=3)],
        map_structure=_geladeira_map_structure(levels=4, escs_per_nivel=5),
        allocations={
            **_empty_allocations_grid(levels=4, escs_per_nivel=5),
            "R1-E1-1-1": {"p1": "FLV1", "p2": None},
            "R1-E1-1-2": {"p1": "FLV1", "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == []
    assert result["unallocated"] == ["FLV1"]
