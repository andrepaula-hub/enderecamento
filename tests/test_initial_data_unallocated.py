from core.initial_data import _build_unallocated_section
from core.data_prep import build_base_produtos_map


def test_build_unallocated_section_keeps_partial_shortfalls_in_unallocated():
    base_produtos_map = {
        "SKU1": {
            "product_code": "SKU1",
            "product_name": "Produto 1",
            "escaninhos_necessarios": 3,
            "grupo": "alimento",
            "categoria_armazenagem": "Itens de prateleira",
            "curva": "A",
        },
        "SKU2": {
            "product_code": "SKU2",
            "product_name": "Produto 2",
            "escaninhos_necessarios": 1,
            "grupo": "alimento",
            "categoria_armazenagem": "Itens de prateleira",
            "curva": "B",
        },
    }
    base_produtos_data = list(base_produtos_map.values())
    plano_data = [
        {"product_code": "SKU1", "location_id": "LJ060001-R2-001-5A"},
    ]
    metrics = {}

    _, unallocated = _build_unallocated_section(
        base_produtos_map=base_produtos_map,
        base_produtos_data=base_produtos_data,
        plano_data=plano_data,
        log_falhas_data=[],
        card175_invalid_data=[],
        metrics=metrics,
    )

    sku1 = [row for row in unallocated if row["product_code"] == "SKU1"]
    sku2 = [row for row in unallocated if row["product_code"] == "SKU2"]

    assert len(sku1) == 2
    assert all(item["has_any_address"] is True for item in sku1)
    assert len(sku2) == 1
    assert sku2[0]["has_any_address"] is False
    assert metrics["totalNaoAlocados"] == 3


def test_card175_invalid_does_not_double_count_products_already_in_mix():
    """
    Produto com 4 escaninhos necessários, 1 já alocado no plano,
    E também presente em card175_invalid_data com ENDERECO_NAO_MAPEADO.
    Deve aparecer 3 vezes na lista (4-1=3), NÃO 4 vezes (double-count bug).
    """
    base_produtos_map = {
        "LIMAO": {
            "product_code": "LIMAO",
            "product_name": "Limão Premium 1kg",
            "escaninhos_necessarios": 4,
            "grupo": "flv",
            "categoria_armazenagem": "Itens de prateleira",
        }
    }
    plano_data = [
        {"product_code": "LIMAO", "location_id": "LJ-R1-001-1A"},
    ]
    card175_invalid_data = [
        {
            "cod_produto": "LIMAO",
            "desc_produto": "Limão Premium 1kg",
            "motivo": "ENDERECO_NAO_MAPEADO",
            "quantidade": 20,
        }
    ]
    metrics = {}

    _, unallocated = _build_unallocated_section(
        base_produtos_map=base_produtos_map,
        base_produtos_data=list(base_produtos_map.values()),
        plano_data=plano_data,
        log_falhas_data=[],
        card175_invalid_data=card175_invalid_data,
        metrics=metrics,
    )

    limao = [row for row in unallocated if row["product_code"] == "LIMAO"]
    assert len(limao) == 3, f"Esperado 3 (4 necessários - 1 alocado), obtido {len(limao)}"
    assert metrics["totalNaoAlocados"] == 3


def test_card175_invalid_ignores_products_not_in_mix():
    """
    Produto mencionado no Card 175 com endereço inválido, mas que NÃO está no mix ativo.
    Não deve aparecer na lista; produtos fora do mix vindos do Card 175 são ignorados.
    """
    base_produtos_map = {}  # produto não está no mix
    card175_invalid_data = [
        {
            "cod_produto": "FANTASMA",
            "desc_produto": "Produto removido do mix",
            "motivo": "ENDERECO_NAO_MAPEADO",
            "quantidade": 5,
        }
    ]
    metrics = {}

    _, unallocated = _build_unallocated_section(
        base_produtos_map=base_produtos_map,
        base_produtos_data=[],
        plano_data=[],
        log_falhas_data=[],
        card175_invalid_data=card175_invalid_data,
        metrics=metrics,
    )

    removed = [row for row in unallocated if row["product_code"] == "FANTASMA"]
    assert len(removed) == 0


def test_build_base_produtos_map_excludes_zero_quantity_skus():
    base_data = [
        {"product_code": "SKU0", "quantidade": 0, "categoria_site": "mercearia"},
        {"product_code": "SKU1", "quantidade": 2, "categoria_site": "mercearia"},
    ]
    result = build_base_produtos_map(base_data, {"mercearia": "alimento"}, limite_altura=0, limite_altura_baixo=0)
    assert "SKU0" not in result
    assert "SKU1" in result
