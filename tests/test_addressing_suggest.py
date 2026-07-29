from backend.application.addressing.suggest_allocations import suggest_allocations
from core.agent_scoring import _sort_products_for_allocation


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
        "fabricante": "",
    }
    base.update(overrides)
    return base


def test_suggest_allocations_blocks_same_subcategory_when_only_same_level_exists():
    result = suggest_allocations(
        unallocated_codes=["NEW"],
        products_data=[
            _product("BASE", sub="Detergentes e Lava Louças"),
            _product("NEW", sub="Detergentes e Lava Louças"),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 4, "cap": 100},
                ],
            },
        ],
        allocations={
            "R1-E1-1-1": {"p1": None, "p2": None},
            "R1-E1-1-2": {"p1": "BASE", "p2": None},
            "R1-E1-1-3": {"p1": None, "p2": None},
            "R1-E1-1-4": {"p1": None, "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == []
    assert result["unallocated"] == ["NEW"]


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
    moves_by_product = {move["productCode"]: move for move in result["moves"]}
    assert moves_by_product["LEVE"]["escaninhoId"] == "R1-E1-1-1"
    assert moves_by_product["PESADO"]["escaninhoId"] == "R1-E1-2-1"


def test_suggest_allocations_requires_geladeira_alta_for_tall_refrigerated_products():
    product = _product("ALTO", nome="Bebida refrigerada alta", arm="Geladeira", alto=True)
    regular_only = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira", "niveis": 4, "escsPerNivel": 5, "cap": 100},
            ],
        }
    ]
    regular_allocations = {
        f"R1-E1-{level}-{pos}": {"p1": None, "p2": None}
        for level in range(1, 5)
        for pos in range(1, 6)
    }

    blocked = suggest_allocations(
        unallocated_codes=["ALTO"],
        products_data=[product],
        map_structure=regular_only,
        allocations=regular_allocations,
        options={"allow_top_level": True},
    )

    assert blocked["moves"] == []
    assert blocked["unallocated"] == ["ALTO"]

    with_high_fridge = [
        {
            "id": "R1",
            "equipment": [
                {"id": "R1-E1", "tipo": "geladeira", "niveis": 4, "escsPerNivel": 5, "cap": 100},
                {"id": "R1-E2", "tipo": "geladeira_alta", "niveis": 4, "escsPerNivel": 5, "cap": 100},
            ],
        }
    ]
    allocations = dict(regular_allocations)
    allocations.update({
        f"R1-E2-{level}-{pos}": {"p1": None, "p2": None}
        for level in range(1, 5)
        for pos in range(1, 6)
    })

    placed = suggest_allocations(
        unallocated_codes=["ALTO"],
        products_data=[product],
        map_structure=with_high_fridge,
        allocations=allocations,
        options={"allow_top_level": True},
    )

    assert placed["moves"]
    assert placed["moves"][0]["escaninhoId"].startswith("R1-E2-")


def test_suggest_allocations_accepts_generator_fridge_for_regular_refrigerated_products():
    result = suggest_allocations(
        unallocated_codes=["NAO"],
        products_data=[
            _product("NAO", nome="Produto refrigerado nao pode sofrer", arm="Geladeira", degelo="NÃO"),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "geladeira_gerador", "niveis": 5, "escsPerNivel": 5, "cap": 100},
                ],
            }
        ],
        allocations=_empty_allocations_grid(levels=5, escs_per_nivel=5),
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"]
    assert result["moves"][0]["productCode"] == "NAO"


def test_suggest_allocations_keeps_heavy_blocked_on_top_even_when_click_started_on_top():
    base_payload = {
        "unallocated_codes": ["PESADO"],
        "products_data": [_product("PESADO", nome="Produto pesado", pesado=True, peso=3.5, sub="Outra")],
        "map_structure": _map_structure(levels=1),
        "allocations": _empty_allocations(levels=1),
    }

    blocked = suggest_allocations(**base_payload, options={"allow_top_level": True})
    assert blocked["success"] is True
    assert blocked["moves"] == []
    assert blocked["unallocated"] == ["PESADO"]

    still_blocked = suggest_allocations(
        **base_payload,
        options={"allow_top_level": True, "allow_clicked_top_level": True},
    )
    assert still_blocked["success"] is True
    assert still_blocked["moves"] == []
    assert still_blocked["unallocated"] == ["PESADO"]


def test_product_order_is_stable_and_ignores_name_group_curve_and_physical_flags():
    products = [
        {
            "product_code": "SKU-A",
            "product_name": "Zebra",
            "grupo": "quimico",
            "curva": "A",
            "is_alto": True,
        },
        {
            "product_code": "SKU-B",
            "product_name": "Abacate",
            "grupo": "flv",
            "curva": "B",
            "is_fragil": True,
        },
        {
            "product_code": "SKU-C",
            "product_name": "Meio",
            "grupo": "alimento",
            "curva": "C",
        },
    ]

    expected = ["SKU-C", "SKU-A", "SKU-B"]
    assert [row["product_code"] for row in _sort_products_for_allocation(products)] == expected

    changed_metadata = [
        {
            **row,
            "product_name": f"Outro {index}",
            "grupo": "neutro",
            "curva": "E",
            "is_alto": False,
            "is_fragil": False,
        }
        for index, row in enumerate(reversed(products))
    ]
    assert [row["product_code"] for row in _sort_products_for_allocation(changed_metadata)] == expected


def test_sort_products_for_street_fill_prioritizes_curve():
    products = [
        {"product_code": "SKU-B", "curva": "B"},
        {"product_code": "SKU-D", "curva": "D"},
        {"product_code": "SKU-A", "curva": "A"},
        {"product_code": "SKU-C", "curva": "C"},
    ]

    result = _sort_products_for_allocation(products, curve_priority_enabled=True)

    assert [row["curva"] for row in result] == ["A", "B", "C", "D"]


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


def test_suggest_allocations_keeps_flv_blocked_on_top_even_with_clicked_top_override():
    result = suggest_allocations(
        unallocated_codes=["FLV1"],
        products_data=[_product("FLV1", nome="Banana prata", grupo="FLV")],
        map_structure=_map_structure(levels=1),
        allocations=_empty_allocations(levels=1),
        options={"allow_top_level": True, "allow_clicked_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == []
    assert result["unallocated"] == ["FLV1"]


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


def test_suggest_allocations_keeps_eggs_blocked_on_top_even_with_clicked_top_override():
    result = suggest_allocations(
        unallocated_codes=["OVO1"],
        products_data=[_product("OVO1", nome="Ovo caipira c/10")],
        map_structure=_map_structure(levels=1),
        allocations=_empty_allocations(levels=1),
        options={"allow_top_level": True, "allow_clicked_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == []
    assert result["unallocated"] == ["OVO1"]


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


def test_suggest_allocations_counts_existing_board_entry_ids_as_same_product():
    allocations = {
        **_empty_allocations_grid(levels=5, escs_per_nivel=7),
        "R1-E1-2-3": {"p1": "unallocated::BROCOLIS::1", "p2": None},
        "R1-E1-2-4": {"p1": "unallocated::BROCOLIS::2", "p2": None},
    }
    result = suggest_allocations(
        unallocated_codes=["BROCOLIS"] * 20,
        products_data=[
            _product("BROCOLIS", nome="Brócolis c/ 1UN", grupo="FLV", arm="geladeira", escsNec=5),
        ],
        map_structure=_geladeira_map_structure(levels=5, escs_per_nivel=7),
        allocations=allocations,
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert len(result["moves"]) == 3
    assert result["summary"]["total_requested"] == 3


def test_suggest_allocations_does_not_allocate_when_board_entry_ids_already_satisfy_required_bins():
    allocations = {
        **_empty_allocations_grid(levels=5, escs_per_nivel=5),
        "R1-E1-2-1": {"p1": "unallocated::COUVE::1", "p2": None},
        "R1-E1-2-2": {"p1": "unallocated::COUVE::2", "p2": None},
        "R1-E1-2-3": {"p1": "unallocated::COUVE::3", "p2": None},
    }
    result = suggest_allocations(
        unallocated_codes=["COUVE"] * 20,
        products_data=[
            _product("COUVE", nome="Couve manteiga 1UN", grupo="FLV", arm="geladeira", escsNec=3),
        ],
        map_structure=_geladeira_map_structure(levels=5, escs_per_nivel=5),
        allocations=allocations,
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == []
    assert result["summary"]["total_requested"] == 0


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


def test_suggest_allocations_penalizes_visual_family_even_when_subcategory_differs():
    result = suggest_allocations(
        unallocated_codes=["NEW"],
        products_data=[
            _product("BASE", nome="Detergente liquido limpol neutro 500ml", sub="Detergentes e Lava Louças"),
            _product("NEW", nome="Detergente liquido ype coco 500ml", sub="Tudo a 1,99"),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 4, "cap": 100},
                ],
            }
        ],
        allocations={
            "R1-E1-1-1": {"p1": None, "p2": None},
            "R1-E1-1-2": {"p1": "BASE", "p2": None},
            "R1-E1-1-3": {"p1": None, "p2": None},
            "R1-E1-1-4": {"p1": None, "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == [{"escaninhoId": "R1-E1-1-4", "productCode": "NEW", "slot": 1}]


def test_suggest_allocations_avoids_same_subcategory_on_same_level_when_other_level_exists():
    result = suggest_allocations(
        unallocated_codes=["NISSIN2"],
        products_data=[
            _product("NISSIN1", nome="Macarrao instantaneo Nissin Lamen galinha", sub="Massas instantâneas"),
            _product("NISSIN2", nome="Macarrao instantaneo Nissin Lamen carne", sub="Massas instantâneas"),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 2, "escsPerNivel": 7, "cap": 100},
                ],
            }
        ],
        allocations={
            **{
                f"R1-E1-{level}-{pos}": {"p1": None, "p2": None}
                for level in range(1, 3)
                for pos in range(1, 8)
            },
            "R1-E1-1-5": {"p1": "NISSIN1", "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"]
    assert not result["moves"][0]["escaninhoId"].startswith("R1-E1-1-")


def test_suggest_allocations_keeps_rap10_variants_on_different_levels():
    result = suggest_allocations(
        unallocated_codes=["CT189445", "CT189446"],
        products_data=[
            _product("CT189445", nome="RAP10 ORIGINAL 297G", sub="Wraps e Tortillas", fabricante="Bimbo"),
            _product("CT189446", nome="RAP10 INTEGRAL 297G", sub="Wraps e Tortillas", fabricante="Bimbo"),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 5, "escsPerNivel": 7, "cap": 100},
                ],
            }
        ],
        allocations={
            f"R1-E1-{level}-{pos}": {"p1": None, "p2": None}
            for level in range(1, 6)
            for pos in range(1, 8)
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert {move["productCode"] for move in result["moves"]} == {"CT189445", "CT189446"}
    levels = {
        move["productCode"]: int(move["escaninhoId"].split("-")[-2])
        for move in result["moves"]
    }
    assert levels["CT189445"] != levels["CT189446"]


def test_suggest_allocations_spreads_chocolate_trap_mix_across_levels():
    codes = ["SNICKERS", "CHOC_BRANCO", "KITKAT", "LACTA_AO_LEITE", "TONYS"]
    result = suggest_allocations(
        unallocated_codes=codes,
        products_data=[
            _product("SNICKERS", nome="Chocolate Snickers 45g", sub="Chocolates e Bombons", fabricante="Mars"),
            _product("CHOC_BRANCO", nome="Chocolate Branco Laka Lacta 80g", sub="Chocolates e Bombons", fabricante="Mondelez"),
            _product("KITKAT", nome="Chocolate Kit Kat 41,5g", sub="Chocolates e Bombons", fabricante="Nestle"),
            _product("LACTA_AO_LEITE", nome="Chocolate ao leite Lacta 80g", sub="Chocolates e Bombons", fabricante="Mondelez"),
            _product("TONYS", nome="Chocolate Tony's Chocolonely 180g", sub="Chocolates e Bombons", fabricante="Tony's"),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 5, "escsPerNivel": 7, "cap": 100},
                ],
            }
        ],
        allocations={
            f"R1-E1-{level}-{pos}": {"p1": None, "p2": None}
            for level in range(1, 6)
            for pos in range(1, 8)
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert {move["productCode"] for move in result["moves"]} == set(codes)
    levels = [int(move["escaninhoId"].split("-")[-2]) for move in result["moves"]]
    assert len(levels) == len(set(levels))


def test_suggest_allocations_blocks_same_subcategory_level2_on_same_level():
    result = suggest_allocations(
        unallocated_codes=["FESTIVAL"],
        products_data=[
            _product("BOMBOM", nome="Bombom sortido", sub="Chocolates e Bombons", subNivel2="chocolates"),
            _product("FESTIVAL", nome="Chocolate sazonal", sub="Festival de Chocolates", subNivel2="chocolates"),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 4, "cap": 100},
                ],
            }
        ],
        allocations={
            "R1-E1-1-1": {"p1": None, "p2": None},
            "R1-E1-1-2": {"p1": "BOMBOM", "p2": None},
            "R1-E1-1-3": {"p1": None, "p2": None},
            "R1-E1-1-4": {"p1": None, "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == []
    assert result["unallocated"] == ["FESTIVAL"]


def test_suggest_allocations_spreads_same_manufacturer_across_freezers_when_available():
    result = suggest_allocations(
        unallocated_codes=["SADIA2"],
        products_data=[
            _product("SADIA1", nome="Nuggets Sadia", sub="Frangos", fabricante="Sadia", arm="Freezer"),
            _product("SADIA2", nome="File de frango Sadia", sub="Frangos", fabricante="Sadia", arm="Freezer"),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "freezer", "niveis": 5, "escsPerNivel": 5, "cap": 100},
                    {"id": "R1-E2", "tipo": "freezer", "niveis": 5, "escsPerNivel": 5, "cap": 100},
                ],
            }
        ],
        allocations={
            **{
                f"R1-E1-{level}-{pos}": {"p1": None, "p2": None}
                for level in range(1, 6)
                for pos in range(1, 6)
            },
            **{
                f"R1-E2-{level}-{pos}": {"p1": None, "p2": None}
                for level in range(1, 6)
                for pos in range(1, 6)
            },
            "R1-E1-3-3": {"p1": "SADIA1", "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"]
    assert result["moves"][0]["escaninhoId"].startswith("R1-E2-")


def test_suggest_allocations_still_uses_only_freezer_when_concentration_is_unavoidable():
    result = suggest_allocations(
        unallocated_codes=["SADIA2"],
        products_data=[
            _product("SADIA1", nome="Nuggets Sadia", sub="Frangos", fabricante="Sadia", arm="Freezer"),
            _product("SADIA2", nome="File de frango Sadia", sub="Frangos", fabricante="Sadia", arm="Freezer"),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "freezer", "niveis": 2, "escsPerNivel": 2, "cap": 100},
                ],
            }
        ],
        allocations={
            "R1-E1-1-1": {"p1": "SADIA1", "p2": None},
            "R1-E1-1-2": {"p1": None, "p2": None},
            "R1-E1-2-1": {"p1": None, "p2": None},
            "R1-E1-2-2": {"p1": None, "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"]
    assert result["moves"][0]["escaninhoId"].startswith("R1-E1-")


def test_suggest_allocations_can_skip_concentrated_manufacturer_for_better_queue_candidate():
    result = suggest_allocations(
        unallocated_codes=["SADIA2", "OTHER"],
        products_data=[
            _product("SADIA1", nome="Nuggets Sadia", sub="Frangos", fabricante="Sadia", arm="Freezer"),
            _product("SADIA2", nome="File de frango Sadia", sub="Frangos", fabricante="Sadia", arm="Freezer"),
            _product("OTHER", nome="Batata congelada", sub="Salgados e Lanches", fabricante="McCain", arm="Freezer"),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "freezer", "niveis": 2, "escsPerNivel": 2, "cap": 100},
                ],
            }
        ],
        allocations={
            "R1-E1-1-1": {"p1": "SADIA1", "p2": None},
            "R1-E1-1-2": {"p1": None, "p2": None},
            "R1-E1-2-1": {"p1": None, "p2": None},
            "R1-E1-2-2": {"p1": None, "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"]
    assert result["moves"][0]["productCode"] == "OTHER"


def test_suggest_allocations_does_not_group_same_curve_over_family_concentration():
    result = suggest_allocations(
        unallocated_codes=["CAFE2"],
        products_data=[
            _product(
                "CAFE1",
                nome="Cafe torrado e moido 3 coracoes tradicional 500g",
                sub="Cafes",
                fabricante="3 CORACOES",
                familia_visual="cafes|3_coracoes",
                curva="A",
            ),
            _product(
                "CAFE2",
                nome="Cafe soluvel 3 coracoes tradicional refil 40g",
                sub="Cafes",
                fabricante="3 CORACOES",
                familia_visual="cafes|3_coracoes",
                curva="A",
            ),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 2, "escsPerNivel": 2, "cap": 100},
                    {"id": "R1-E2", "tipo": "prateleira", "niveis": 2, "escsPerNivel": 2, "cap": 100},
                ],
            }
        ],
        allocations={
            **{
                f"R1-E1-{level}-{pos}": {"p1": None, "p2": None}
                for level in range(1, 3)
                for pos in range(1, 3)
            },
            **{
                f"R1-E2-{level}-{pos}": {"p1": None, "p2": None}
                for level in range(1, 3)
                for pos in range(1, 3)
            },
            "R1-E1-1-1": {"p1": "CAFE1", "p2": None},
        },
        options={"allow_top_level": True, "whole_street": True},
    )

    assert result["success"] is True
    assert result["moves"]
    assert result["moves"][0]["escaninhoId"].startswith("R1-E2-")


def test_suggest_allocations_avoids_same_family_and_manufacturer_on_same_level_when_clean_level_exists():
    result = suggest_allocations(
        unallocated_codes=["SNICKERS2"],
        products_data=[
            _product(
                "SNICKERS1",
                nome="Snickers original 45g",
                sub="Festival de Chocolates",
                fabricante="Mars Inc",
            ),
            _product(
                "SNICKERS2",
                nome="Chocolate Snickers dark 42g",
                sub="Festival de Chocolates",
                fabricante="Mars Inc",
            ),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 2, "escsPerNivel": 7, "cap": 100},
                ],
            }
        ],
        allocations={
            **{
                f"R1-E1-{level}-{pos}": {"p1": None, "p2": None}
                for level in range(1, 3)
                for pos in range(1, 8)
            },
            "R1-E1-1-4": {"p1": "SNICKERS1", "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"]
    assert result["moves"][0]["escaninhoId"].startswith("R1-E1-2-")


def test_suggest_allocations_avoids_brand_variants_on_same_level_when_clean_level_exists():
    result = suggest_allocations(
        unallocated_codes=["RAP10_ORIGINAL", "RAP10_INTEGRAL", "PINCBAR_CHOC", "PINCBAR_MORANGO"],
        products_data=[
            _product("RAP10_ORIGINAL", nome="Rap10 Original 297g", sub="Wraps"),
            _product("RAP10_INTEGRAL", nome="Rap10 Integral 297g", sub="Wraps"),
            _product("PINCBAR_CHOC", nome="Barra de Proteína Pincbar Chocolate 50g", sub="Barras de proteína"),
            _product("PINCBAR_MORANGO", nome="Barra de Proteína Pincbar Morango 50g", sub="Barras de proteína"),
        ],
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
    levels_by_family = {}
    for move in result["moves"]:
        _, _, level, _ = move["escaninhoId"].split("-")
        family = "rap10" if move["productCode"].startswith("RAP10") else "pincbar"
        levels_by_family.setdefault(family, set()).add(int(level))
    assert len(levels_by_family["rap10"]) == 2
    assert len(levels_by_family["pincbar"]) == 2


def test_suggest_allocations_splits_large_multibin_block_into_contiguous_adjacent_levels():
    result = suggest_allocations(
        unallocated_codes=["CARVAO"] * 9,
        products_data=[
            _product("CARVAO", nome="Carvao vegetal 2,5kg", sub="Churrasco", escsNec=9),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 2, "escsPerNivel": 7, "cap": 100},
                ],
            }
        ],
        allocations={
            f"R1-E1-{level}-{pos}": {"p1": None, "p2": None}
            for level in range(1, 3)
            for pos in range(1, 8)
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert len(result["moves"]) == 9
    by_level = {}
    for move in result["moves"]:
        _, _, level, pos = move["escaninhoId"].split("-")
        by_level.setdefault(int(level), []).append(int(pos))
    assert sorted(len(values) for values in by_level.values()) == [2, 7]
    short_level_positions = min((sorted(values) for values in by_level.values()), key=len)
    assert short_level_positions in ([1, 2], [6, 7])


def test_suggest_allocations_treats_multibin_sku_as_full_atomic_demand_from_single_entry():
    result = suggest_allocations(
        unallocated_codes=["DIABO"],
        products_data=[
            _product("DIABO", nome="Desentupidor Diabo Verde 1L", sub="Desentupidores", escsNec=3),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 4, "cap": 100},
                ],
            }
        ],
        allocations={
            f"R1-E1-1-{pos}": {"p1": None, "p2": None}
            for pos in range(1, 5)
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert len(result["moves"]) == 3
    assert {move["productCode"] for move in result["moves"]} == {"DIABO"}
    assert [move["escaninhoId"] for move in result["moves"]] == [
        "R1-E1-1-1",
        "R1-E1-1-2",
        "R1-E1-1-3",
    ]


def test_suggest_allocations_drops_multibin_plan_when_only_broken_positions_exist():
    result = suggest_allocations(
        unallocated_codes=["DIABO"],
        products_data=[
            _product("DIABO", nome="Desentupidor Diabo Verde 1L", sub="Desentupidores", escsNec=3),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 5, "cap": 100},
                ],
            }
        ],
        allocations={
            "R1-E1-1-1": {"p1": None, "p2": None},
            "R1-E1-1-2": {"p1": "BASE1", "p2": None},
            "R1-E1-1-3": {"p1": None, "p2": None},
            "R1-E1-1-4": {"p1": "BASE2", "p2": None},
            "R1-E1-1-5": {"p1": None, "p2": None},
        },
        options={"allow_top_level": True},
    )

    assert result["success"] is True
    assert result["moves"] == []
    assert result["unallocated"] == ["DIABO"]


def test_suggest_allocations_returns_slot_2_when_second_slot_is_allowed():
    result = suggest_allocations(
        unallocated_codes=["NEW"],
        products_data=[_product("NEW", sub="Outra")],
        map_structure=_map_structure(levels=1),
        allocations={"R1-E1-1-1": {"p1": "BASE", "p2": None}},
        options={"allow_top_level": True, "allow_second_slot": True},
    )

    assert result["success"] is True
    assert result["moves"] == [{"escaninhoId": "R1-E1-1-1", "productCode": "NEW", "slot": 2}]


def test_suggest_allocations_treats_scoped_blocked_slots_as_unavailable_for_second_slot():
    result = suggest_allocations(
        unallocated_codes=["NEW"],
        products_data=[_product("NEW", sub="Outra")],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 2, "cap": 100},
                ],
            },
        ],
        allocations={
            "R1-E1-1-1": {"p1": "BASE", "p2": None},
            "R1-E1-1-2": {"p1": "__BLOCKED__", "p2": None},
        },
        options={"allow_top_level": True, "allow_second_slot": True},
    )

    assert result["success"] is True
    assert result["moves"] == [{"escaninhoId": "R1-E1-1-1", "productCode": "NEW", "slot": 2}]


def test_suggest_allocations_places_multibin_products_in_second_slot_scope():
    result = suggest_allocations(
        unallocated_codes=["LIMPOL", "LIMPOL"],
        products_data=[_product("LIMPOL", sub="Detergentes e Lava Louças", escsNec=2)],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 3, "cap": 100},
                ],
            },
        ],
        allocations={
            "R1-E1-1-1": {"p1": "BASE1", "p2": None},
            "R1-E1-1-2": {"p1": "BASE2", "p2": None},
            "R1-E1-1-3": {"p1": "__BLOCKED__", "p2": None},
        },
        options={"allow_top_level": True, "allow_second_slot": True},
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E1-1-1", "productCode": "LIMPOL", "slot": 2},
        {"escaninhoId": "R1-E1-1-2", "productCode": "LIMPOL", "slot": 2},
    ]


def test_suggest_allocations_second_slot_uses_full_capacity_with_volume_per_bin():
    result = suggest_allocations(
        unallocated_codes=["LIMPOL", "LIMPOL"],
        products_data=[
            _product("BASE", sub="Outra", vol=10, qtd=1, escsNec=1),
            _product("LIMPOL", sub="Detergentes e Lava Louças", vol=0.9, qtd=30, escsNec=2),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 2, "cap": 25.92},
                ],
            },
        ],
        allocations={
            "R1-E1-1-1": {"p1": "BASE", "p2": None},
            "R1-E1-1-2": {"p1": "BASE", "p2": None},
        },
        options={"allow_top_level": True, "allow_second_slot": True},
    )

    assert result["success"] is True
    assert result["moves"] == [
        {"escaninhoId": "R1-E1-1-1", "productCode": "LIMPOL", "slot": 2},
        {"escaninhoId": "R1-E1-1-2", "productCode": "LIMPOL", "slot": 2},
    ]


def test_suggest_allocations_second_slot_blocks_when_combined_volume_exceeds_capacity():
    result = suggest_allocations(
        unallocated_codes=["LIMPOL", "LIMPOL"],
        products_data=[
            _product("BASE", sub="Outra", vol=20, qtd=1, escsNec=1),
            _product("LIMPOL", sub="Detergentes e Lava Louças", vol=0.9, qtd=30, escsNec=2),
        ],
        map_structure=[
            {
                "id": "R1",
                "equipment": [
                    {"id": "R1-E1", "tipo": "prateleira", "niveis": 1, "escsPerNivel": 2, "cap": 25.92},
                ],
            },
        ],
        allocations={
            "R1-E1-1-1": {"p1": "BASE", "p2": None},
            "R1-E1-1-2": {"p1": "BASE", "p2": None},
        },
        options={"allow_top_level": True, "allow_second_slot": True},
    )

    assert result["success"] is True
    assert result["moves"] == []
    assert result["unallocated"] == ["LIMPOL"]
