from __future__ import annotations

from typing import Any

import core.enrichment_pipeline as enrichment_pipeline
from core.initial_data import (
    _build_content_html,
    _build_dashboard_data,
    _enrich_base_map_with_master_etl,
    _resolve_slot_volume_model,
    _slot_quantity_and_volume,
)


class _FakeClient:
    def __init__(self, values_by_sheet: dict[str, list[list[Any]]]):
        self._values_by_sheet = values_by_sheet
        self.cleared: list[str] = []

    def list_sheet_names(self) -> list[str]:
        return list(self._values_by_sheet.keys())

    def read_values(self, sheet_name: str) -> list[list[Any]]:
        return self._values_by_sheet.get(sheet_name, [])

    def ensure_sheet(self, sheet_name: str) -> None:
        self._values_by_sheet.setdefault(sheet_name, [])

    def clear_sheet(self, sheet_name: str) -> None:
        self.cleared.append(sheet_name)
        self._values_by_sheet[sheet_name] = []

    def append_rows(self, sheet_name: str, rows: list[list[Any]]) -> None:
        self._values_by_sheet[sheet_name] = rows

    def update_rows(self, sheet_name: str, row_updates: dict[int, list[Any]], header_len: int) -> None:
        rows = self._values_by_sheet.setdefault(sheet_name, [])
        for row_num, values in row_updates.items():
            while len(rows) < row_num:
                rows.append([])
            rows[row_num - 1] = values[:header_len] + [""] * max(0, header_len - len(values))

    def get_title(self) -> str:
        return "Fake Sheet"

    def get_sheet_url(self, sheet_name: str) -> str:
        return f"https://fake/{sheet_name}"


class _FakeSource:
    def __init__(self, rows_by_sheet: dict[str, list[dict[str, Any]]], values_by_sheet: dict[str, list[list[Any]]]):
        self._rows_by_sheet = rows_by_sheet
        self.client = _FakeClient(values_by_sheet)

    def read_sheet(self, sheet_name: str) -> list[dict[str, Any]]:
        return self._rows_by_sheet.get(sheet_name, [])


def test_master_etl_enrichment_sets_categoria_vendas_e_curva_d():
    source = _FakeSource(
        rows_by_sheet={
            "Categoria ChatGPT": [
                {"cod_produto": "KDB11620", "Categoria_Correta": "Itens de prateleira"},
            ],
            "Subcategorias": [
                {"cod_produto": "KDB11620", "subcategoria": "Novidades"},
            ],
            "Categoria Site": [
                {"cod_produto": "KDB11620", "categoria": "Guloseimas"},
                {"cod_produto": "SEM_VENDA", "categoria": "Guloseimas"},
            ],
            "volumetria e fabricantes": [
                {"cod_produto": "KDB11620", "volume_cm3": 178.5, "altura_cm": 7, "fabricante": "VERDURAS"},
                {"cod_produto": "SEM_VENDA", "volume_cm3": 320.0, "altura_cm": 12, "fabricante": "MARCA X"},
            ],
        },
        values_by_sheet={
            # Colunas duplicadas simulam o formato real de "Vendas Alvo"
            "Vendas Alvo": [
                ["cod_produto", "desc_produto", "qtd", "cod_produto", "desc_produto", "qtd"],
                ["KDB11620", "CHOCOLATE FEASTABLES MILK CRUNCH 60G", 26, "", "", ""],
            ]
        },
    )

    base_map = {
        "KDB11620": {
            "product_code": "KDB11620",
            "product_name": "CHOCOLATE FEASTABLES MILK CRUNCH 60G",
            "quantidade": 100,
            "categoria_armazenagem": "",
            "subcategoria": "",
            "categoria_site": "",
            "venda_total": "",
            "curva": "",
        },
        "SEM_VENDA": {
            "product_code": "SEM_VENDA",
            "product_name": "PRODUTO SEM VENDA",
            "quantidade": 8,
            "categoria_armazenagem": "",
            "subcategoria": "",
            "categoria_site": "",
            "venda_total": "",
            "curva": "",
        },
    }

    dic_cat_map = {"guloseimas": "alimento"}
    enriched = _enrich_base_map_with_master_etl(
        source=source,
        base_produtos_map=base_map,
        dic_cat_map=dic_cat_map,
        limite_altura=28.0,
        limite_altura_baixo=12.5,
    )

    with_sales = enriched["KDB11620"]
    assert with_sales["categoria_armazenagem"] == "Itens de prateleira"
    assert with_sales["subcategoria"] == "Novidades"
    assert with_sales["categoria_site"] == "Guloseimas"
    assert with_sales["grupo"] == "alimento"
    assert float(with_sales["venda_total"]) == 26.0
    assert with_sales["curva"] in {"A", "B", "C"}

    no_sales = enriched["SEM_VENDA"]
    assert no_sales["curva"] == "D"
    assert float(no_sales["venda_total"]) == 0.0


def test_master_etl_enrichment_reads_familia_visual_sheet():
    source = _FakeSource(
        rows_by_sheet={
            "Familia Visual": [
                {"cod_produto": "RAP10_ORIGINAL", "familia_visual": "wrap_rap10"},
            ],
        },
        values_by_sheet={},
    )
    base_map = {
        "RAP10_ORIGINAL": {
            "product_code": "RAP10_ORIGINAL",
            "product_name": "RAP10 ORIGINAL 297G",
            "familia_visual": "",
        }
    }

    enriched = _enrich_base_map_with_master_etl(
        source=source,
        base_produtos_map=base_map,
        dic_cat_map={},
        limite_altura=28.0,
        limite_altura_baixo=12.5,
    )

    assert enriched["RAP10_ORIGINAL"]["familia_visual"] == "wrap_rap10"


def test_run_etl_writes_familia_visual_from_master_sheet():
    master_values = {
        "Degelo": [["cod_produto", "degelo"], ["RAP10_ORIGINAL", ""]],
        "Categoria ChatGPT": [["cod_produto", "Categoria_Correta"], ["RAP10_ORIGINAL", "Itens de prateleira"]],
        "Categoria Site": [["cod_produto", "categoria"], ["RAP10_ORIGINAL", "Mercearia"]],
        "Subcategorias": [["cod_produto", "subcategoria"], ["RAP10_ORIGINAL", "Wraps e Tortillas"]],
        "volumetria e fabricantes": [
            ["cod_produto", "volume_cm3", "altura_cm", "fabricante"],
            ["RAP10_ORIGINAL", 1000, 10, "Bimbo"],
        ],
        "Familia Visual": [["cod_produto", "familia_visual"], ["RAP10_ORIGINAL", "wrap_rap10"]],
        "Vendas Alvo": [["cod_produto", "desc_produto", "qtd_total"], ["RAP10_ORIGINAL", "RAP10 ORIGINAL 297G", 10]],
        "Volumetria_Equipamentos": [["tipo_equipamento", "capacidade_l"], ["prateleira", 25]],
        "Configuracoes_Operacionais": [["parametro", "valor"], ["limite_peso_kg", 0.7]],
        "Dicionario_Categorias": [["categoria_site", "grupo"], ["Mercearia", "alimento"]],
    }
    mix_values = {
        "MIX": [["product_code", "product_name", "quantidade"], ["RAP10_ORIGINAL", "RAP10 ORIGINAL 297G", 3]],
    }
    target_values = {"Base_Produtos": [enrichment_pipeline.BASE_OUTPUT_HEADERS], "Plano_Enderecamento_Final": [["location_id"]]}
    clients = {"master": _FakeClient(master_values), "mix": _FakeClient(mix_values), "target": _FakeClient(target_values)}

    original_client = enrichment_pipeline.GSheetsClient
    enrichment_pipeline.GSheetsClient = lambda sheet_id: clients[sheet_id]
    try:
        result = enrichment_pipeline.run_etl_to_base_products("master", "mix", "target")
    finally:
        enrichment_pipeline.GSheetsClient = original_client

    assert result["success"] is True
    output = clients["target"].read_values("Base_Produtos")
    headers = output[0]
    assert output[1][headers.index("familia_visual")] == "wrap_rap10"
    assert result["links"]["master_familia_visual"] == "https://fake/Familia Visual"


def test_run_etl_replaces_invalid_measure_visual_family_from_master_sheet():
    master_values = {
        "Degelo": [["cod_produto", "degelo"], ["BANANA1", ""]],
        "Categoria ChatGPT": [["cod_produto", "Categoria_Correta"], ["BANANA1", "Itens de prateleira"]],
        "Categoria Site": [["cod_produto", "categoria"], ["BANANA1", "FLV"]],
        "Subcategorias": [["cod_produto", "subcategoria"], ["BANANA1", "Frutas, Legumes e Verduras"]],
        "volumetria e fabricantes": [
            ["cod_produto", "volume_cm3", "altura_cm", "fabricante"],
            ["BANANA1", 1000, 10, "FRUTAS"],
        ],
        "Familia Visual": [["cod_produto", "familia_visual"], ["BANANA1", "frutas, legumes e verduras|500g"]],
        "Vendas Alvo": [["cod_produto", "desc_produto", "qtd_total"], ["BANANA1", "BANANA PRATA MADURA ORGÂNICA 500G", 10]],
        "Volumetria_Equipamentos": [["tipo_equipamento", "capacidade_l"], ["prateleira", 25]],
        "Configuracoes_Operacionais": [["parametro", "valor"], ["limite_peso_kg", 0.7]],
        "Dicionario_Categorias": [["categoria_site", "grupo"], ["FLV", "flv"]],
    }
    mix_values = {
        "MIX": [["product_code", "product_name", "quantidade"], ["BANANA1", "BANANA PRATA MADURA ORGÂNICA 500G", 3]],
    }
    target_values = {"Base_Produtos": [enrichment_pipeline.BASE_OUTPUT_HEADERS], "Plano_Enderecamento_Final": [["location_id"]]}
    clients = {"master": _FakeClient(master_values), "mix": _FakeClient(mix_values), "target": _FakeClient(target_values)}

    original_client = enrichment_pipeline.GSheetsClient
    enrichment_pipeline.GSheetsClient = lambda sheet_id: clients[sheet_id]
    try:
        result = enrichment_pipeline.run_etl_to_base_products("master", "mix", "target")
    finally:
        enrichment_pipeline.GSheetsClient = original_client

    assert result["success"] is True
    output = clients["target"].read_values("Base_Produtos")
    headers = output[0]
    assert output[1][headers.index("familia_visual")] == "frutas, legumes e verduras|banana"
    family_sheet = clients["master"].read_values("Familia Visual")
    family_headers = family_sheet[0]
    assert family_sheet[1][family_headers.index("familia_visual")] == "frutas, legumes e verduras|banana"


def test_run_etl_creates_and_populates_familia_visual_sheet_when_missing():
    master_values = {
        "Degelo": [["cod_produto", "degelo"], ["CT189445", ""]],
        "Categoria ChatGPT": [["cod_produto", "Categoria_Correta"], ["CT189445", "Itens de prateleira"]],
        "Categoria Site": [["cod_produto", "categoria"], ["CT189445", "Mercearia"]],
        "Subcategorias": [["cod_produto", "subcategoria"], ["CT189445", "Wraps e Tortillas"]],
        "volumetria e fabricantes": [
            ["cod_produto", "volume_cm3", "altura_cm", "fabricante"],
            ["CT189445", 1000, 10, "Bimbo"],
        ],
        "Vendas Alvo": [["cod_produto", "desc_produto", "qtd_total"], ["CT189445", "RAP10 ORIGINAL 297G", 10]],
        "Volumetria_Equipamentos": [["tipo_equipamento", "capacidade_l"], ["prateleira", 25]],
        "Configuracoes_Operacionais": [["parametro", "valor"], ["limite_peso_kg", 0.7]],
        "Dicionario_Categorias": [["categoria_site", "grupo"], ["Mercearia", "alimento"]],
    }
    mix_values = {"MIX": [["product_code", "product_name", "quantidade"], ["CT189445", "RAP10 ORIGINAL 297G", 3]]}
    target_values = {"Base_Produtos": [enrichment_pipeline.BASE_OUTPUT_HEADERS], "Plano_Enderecamento_Final": [["location_id"]]}
    clients = {"master": _FakeClient(master_values), "mix": _FakeClient(mix_values), "target": _FakeClient(target_values)}

    original_client = enrichment_pipeline.GSheetsClient
    enrichment_pipeline.GSheetsClient = lambda sheet_id: clients[sheet_id]
    try:
        result = enrichment_pipeline.run_etl_to_base_products("master", "mix", "target")
    finally:
        enrichment_pipeline.GSheetsClient = original_client

    assert result["success"] is True
    family_sheet = clients["master"].read_values("Familia Visual")
    assert family_sheet[0] == enrichment_pipeline.FAMILIA_VISUAL_HEADERS
    assert family_sheet[1][0] == "CT189445"
    assert family_sheet[1][4] == "wraps e tortillas|rap10"

    output = clients["target"].read_values("Base_Produtos")
    headers = output[0]
    assert output[1][headers.index("familia_visual")] == "wraps e tortillas|rap10"


def test_run_etl_creates_subcategory_level2_sheet_and_writes_output_column():
    master_values = {
        "Degelo": [["cod_produto", "degelo"], ["CHOC1", ""]],
        "Categoria ChatGPT": [["cod_produto", "Categoria_Correta"], ["CHOC1", "Itens de prateleira"]],
        "Categoria Site": [["cod_produto", "categoria"], ["CHOC1", "Guloseimas"]],
        "Subcategorias": [["cod_produto", "subcategoria"], ["CHOC1", "Festival de Chocolates"]],
        "volumetria e fabricantes": [
            ["cod_produto", "volume_cm3", "altura_cm", "fabricante"],
            ["CHOC1", 1000, 10, "Mars"],
        ],
        "Vendas Alvo": [["cod_produto", "desc_produto", "qtd_total"], ["CHOC1", "SNICKERS 45G", 10]],
        "Volumetria_Equipamentos": [["tipo_equipamento", "capacidade_l"], ["prateleira", 25]],
        "Configuracoes_Operacionais": [["parametro", "valor"], ["limite_peso_kg", 0.7]],
        "Dicionario_Categorias": [["categoria_site", "grupo"], ["Guloseimas", "alimento"]],
    }
    mix_values = {"MIX": [["product_code", "product_name", "quantidade"], ["CHOC1", "SNICKERS 45G", 3]]}
    target_values = {"Base_Produtos": [enrichment_pipeline.BASE_OUTPUT_HEADERS], "Plano_Enderecamento_Final": [["location_id"]]}
    clients = {"master": _FakeClient(master_values), "mix": _FakeClient(mix_values), "target": _FakeClient(target_values)}

    original_client = enrichment_pipeline.GSheetsClient
    enrichment_pipeline.GSheetsClient = lambda sheet_id: clients[sheet_id]
    try:
        result = enrichment_pipeline.run_etl_to_base_products("master", "mix", "target")
    finally:
        enrichment_pipeline.GSheetsClient = original_client

    assert result["success"] is True
    level2_sheet = clients["master"].read_values("Subcategorias Nivel 2")
    assert level2_sheet[0] == enrichment_pipeline.SUBCATEGORIA_NIVEL_2_HEADERS
    assert ["Festival de Chocolates", "chocolates", "seed propostaNivel2"] in level2_sheet

    output = clients["target"].read_values("Base_Produtos")
    headers = output[0]
    assert output[1][headers.index("subcategoria_nivel_2")] == "chocolates"
    assert result["links"]["master_subcategorias_nivel_2"] == "https://fake/Subcategorias Nivel 2"


def test_suggest_visual_family_never_uses_measure_as_family_token():
    assert (
        enrichment_pipeline._suggest_visual_family(
            "DETERGENTE LIQUIDO LIMPOL NEUTRO 500ML",
            "Detergentes",
            "Bombril",
        )
        == "detergentes|limpol"
    )
    assert (
        enrichment_pipeline._suggest_visual_family(
            "RAP10 ORIGINAL 297G",
            "Wraps e Tortillas",
            "Bimbo",
        )
        == "wraps e tortillas|rap10"
    )
    assert (
        enrichment_pipeline._suggest_visual_family(
            "CAFÉ TORRADO E MOÍDO 3 CORAÇÕES TRADICIONAL 500G",
            "Cafés",
            "3 CORAÇÕES",
        )
        == "cafes|3_coracoes"
    )
    assert (
        enrichment_pipeline._suggest_visual_family(
            "CAFÉ SOLÚVEL 3 CORAÇÕES TRADICIONAL REFIL 50G",
            "Cafés",
            "3 CORAÇÕES",
        )
        == "cafes|3_coracoes"
    )
    assert (
        enrichment_pipeline._suggest_visual_family(
            "SORVETE BACIO DI LATTE PISTACCHIO 490ML",
            "Sorvetes e Sobremesas",
            "Bacio di Latte",
        )
        == "sorvetes e sobremesas|bacio_di_latte"
    )
    assert (
        enrichment_pipeline._suggest_visual_family(
            "SORVETE HAAGEN DAZS BAUNILHA 473ML",
            "Sorvetes e Sobremesas",
            "General Mills",
        )
        == "sorvetes e sobremesas|haagen_dazs"
    )
    assert (
        enrichment_pipeline._suggest_visual_family(
            "NUGGETS DE FRANGO TRADICIONAL SADIA 300G",
            "Frangos",
            "Sadia",
        )
        == "frangos|nuggets"
    )


def test_card175_marks_product_when_missing_bins():
    base_map = {
        "SKU1": {
            "product_code": "SKU1",
            "product_name": "Produto 1",
            "grupo": "alimento",
            "categoria_armazenagem": "Itens de prateleira",
            "subcategoria": "Teste",
            "curva": "A",
            "quantidade": 12,
            "vol_l_unitario": 1.5,
            "vol_L_unitario": 1.5,
            "escaninhos_necessarios": 3,
        }
    }
    plano_rows = [
        {
            "location_id": "LJX-R1-001-1A",
            "rua_num": 1,
            "equipamento_num": 1,
            "tipo_equipamento": "prateleira",
            "tipo_equipamento_final": "prateleira",
            "nivel": 1,
            "escaninho_num_no_nivel": 1,
            "capacidade_l": 10,
            "product_code": "SKU1",
            "product_name": "Produto 1",
            "quantidade": 12,
            "grupo": "alimento",
            "categoria_armazenagem": "Itens de prateleira",
            "subcategoria": "Teste",
            "curva": "A",
        }
    ]

    dashboard_data = _build_dashboard_data(plano_rows, base_map)
    html = _build_content_html(dashboard_data, base_map, metrics={})

    assert 'data-missing-total="2"' in html
    assert "slot-extra-flag" in html
    assert "Escaninhos no mapa:</b> 1/3" in html


def test_run_etl_updates_sales_for_allocated_skus_only():
    master_values = {
        "Degelo": [["cod_produto", "degelo"], ["SKU1", ""], ["SKU2", ""]],
        "Categoria ChatGPT": [["cod_produto", "Categoria_Correta"], ["SKU1", "Itens de prateleira"], ["SKU2", "Itens de prateleira"]],
        "Categoria Site": [["cod_produto", "categoria"], ["SKU1", "Mercearia"], ["SKU2", "Mercearia"]],
        "Subcategorias": [["cod_produto", "subcategoria"], ["SKU1", "Massas"], ["SKU2", "Massas"]],
        "volumetria e fabricantes": [
            ["cod_produto", "volume_cm3", "altura_cm", "fabricante"],
            ["SKU1", 1000, 10, "Marca 1"],
            ["SKU2", 1000, 10, "Marca 2"],
        ],
        "Vendas Alvo": [["cod_produto", "desc_produto", "qtd_total"], ["SKU1", "Produto 1", 120], ["SKU2", "Produto 2", 10]],
        "Volumetria_Equipamentos": [["tipo_equipamento", "capacidade_l"], ["prateleira", 25]],
        "Configuracoes_Operacionais": [["parametro", "valor"], ["limite_peso_kg", 0.7]],
        "Dicionario_Categorias": [["categoria_site", "grupo"], ["Mercearia", "alimento"]],
    }
    mix_values = {
        "Sheet1": [["product_code", "product_name", "quantidade"], ["SKU1", "Produto 1", 5], ["SKU2", "Produto 2", 5]],
    }
    target_values = {
        "Base_Produtos": [
            enrichment_pipeline.BASE_OUTPUT_HEADERS,
            [
                "SKU1", "Produto 1", "FAB ANTIGA", "Geladeira", "Sub antiga", "Site antigo", 10, 1.0, 5,
                "D", "", "", 5.0, 5.0, 0.17, 30.0, "", "", "", 1, "prateleira",
                0, 0, 0, 1, 0, 0, 0, False, "", "", "unitario", "", "",
            ],
            [
                "SKU2", "Produto 2", "Marca 2", "Itens de prateleira", "Massas", "Mercearia", 10, 1.0, 5,
                "D", "", "", 5.0, 2.0, 0.07, 75.0, "", "", "", 1, "prateleira",
                0, 0, 0, 1, 0, 0, 0, False, "", "", "unitario", "", "",
            ],
        ],
        "Plano_Enderecamento_Final": [["location_id", "product_code"], ["LJ-R1-001-1A", "SKU1"]],
    }

    clients = {
        "master": _FakeClient(master_values),
        "mix": _FakeClient(mix_values),
        "target": _FakeClient(target_values),
    }

    original_client = enrichment_pipeline.GSheetsClient

    def _fake_client(sheet_id: str):
        return clients[sheet_id]

    enrichment_pipeline.GSheetsClient = _fake_client
    try:
        result = enrichment_pipeline.run_etl_to_base_products("master", "mix", "target")
    finally:
        enrichment_pipeline.GSheetsClient = original_client

    assert result["success"] is True
    output = clients["target"].read_values("Base_Produtos")
    headers = output[0]
    rows_by_code = {row[0]: row for row in output[1:]}
    idx = {name: headers.index(name) for name in ["nm_fabricante", "categoria_armazenagem", "curva", "venda_total", "venda_media_diaria", "dias_estoque"]}

    sku1 = rows_by_code["SKU1"]
    assert sku1[idx["nm_fabricante"]] == "FAB ANTIGA"
    assert sku1[idx["categoria_armazenagem"]] == "Geladeira"
    assert sku1[idx["venda_total"]] == 120.0
    assert sku1[idx["curva"]] == "B"
    assert sku1[idx["venda_media_diaria"]] == 4.0
    assert sku1[idx["dias_estoque"]] == 1.25
    assert result["sheet_url"] == "https://fake/Base_Produtos"
    assert result["links"]["base_produtos"] == "https://fake/Base_Produtos"

    sku2 = rows_by_code["SKU2"]
    assert sku2[idx["categoria_armazenagem"]] == "Itens de prateleira"
    assert sku2[idx["venda_total"]] == 10.0


def test_run_etl_removes_zero_quantity_sku_even_if_allocated():
    master_values = {
        "Degelo": [["cod_produto", "degelo"], ["SKU0", ""], ["SKU1", ""]],
        "Categoria ChatGPT": [["cod_produto", "Categoria_Correta"], ["SKU0", "Itens de prateleira"], ["SKU1", "Itens de prateleira"]],
        "Categoria Site": [["cod_produto", "categoria"], ["SKU0", "Mercearia"], ["SKU1", "Mercearia"]],
        "Subcategorias": [["cod_produto", "subcategoria"], ["SKU0", "Massas"], ["SKU1", "Massas"]],
        "volumetria e fabricantes": [
            ["cod_produto", "volume_cm3", "altura_cm", "fabricante"],
            ["SKU0", 1000, 10, "Marca 0"],
            ["SKU1", 1000, 10, "Marca 1"],
        ],
        "Vendas Alvo": [["cod_produto", "desc_produto", "qtd_total"], ["SKU0", "Produto 0", 120], ["SKU1", "Produto 1", 10]],
        "Volumetria_Equipamentos": [["tipo_equipamento", "capacidade_l"], ["prateleira", 25]],
        "Configuracoes_Operacionais": [["parametro", "valor"], ["limite_peso_kg", 0.7]],
        "Dicionario_Categorias": [["categoria_site", "grupo"], ["Mercearia", "alimento"]],
    }
    mix_values = {
        "Sheet1": [["product_code", "product_name", "quantidade"], ["SKU0", "Produto 0", 0], ["SKU1", "Produto 1", 5]],
    }
    target_values = {
        "Base_Produtos": [
            enrichment_pipeline.BASE_OUTPUT_HEADERS,
            [
                "SKU0", "Produto 0", "Marca 0", "Itens de prateleira", "Massas", "Mercearia", 10, 1.0, 9,
                "A", "", "", 9.0, 120.0, 4.0, 2.25, "", "", "", 1, "prateleira",
                0, 0, 0, 1, 0, 0, 0, False, "", "", "unitario", "", "",
            ],
            [
                "SKU1", "Produto 1", "Marca 1", "Itens de prateleira", "Massas", "Mercearia", 10, 1.0, 5,
                "D", "", "", 5.0, 2.0, 0.07, 75.0, "", "", "", 1, "prateleira",
                0, 0, 0, 1, 0, 0, 0, False, "", "", "unitario", "", "",
            ],
        ],
        "Plano_Enderecamento_Final": [["location_id", "product_code"], ["LJ-R1-001-1A", "SKU0"]],
    }

    clients = {
        "master": _FakeClient(master_values),
        "mix": _FakeClient(mix_values),
        "target": _FakeClient(target_values),
    }

    original_client = enrichment_pipeline.GSheetsClient
    enrichment_pipeline.GSheetsClient = lambda sheet_id: clients[sheet_id]
    try:
        result = enrichment_pipeline.run_etl_to_base_products("master", "mix", "target")
    finally:
        enrichment_pipeline.GSheetsClient = original_client

    assert result["success"] is True
    assert result["zero_qty_codes_removed"] == 1
    output = clients["target"].read_values("Base_Produtos")
    rows_by_code = {row[0]: row for row in output[1:]}
    assert "SKU0" not in rows_by_code


def test_run_etl_fills_group_from_subcategory_when_categoria_site_is_missing():
    master_values = {
        "Degelo": [["cod_produto", "degelo"], ["KNOWN", ""], ["NEW", ""]],
        "Categoria ChatGPT": [
            ["cod_produto", "Categoria_Correta"],
            ["KNOWN", "Itens de prateleira"],
            ["NEW", "Itens de prateleira"],
        ],
        "Categoria Site": [["cod_produto", "categoria"], ["KNOWN", "Bebidas"], ["KNOWN2", "Bebidas"], ["KNOWN3", "Bebidas"]],
        "Subcategorias": [
            ["product_code", "subcategoria"],
            ["KNOWN", "Drinks Prontos"],
            ["KNOWN2", "Drinks Prontos"],
            ["KNOWN3", "Drinks Prontos"],
            ["NEW", "Drinks Prontos"],
        ],
        "volumetria e fabricantes": [
            ["cod_produto", "volume_cm3", "altura_cm", "fabricante"],
            ["KNOWN", 1000, 10, "Marca 1"],
            ["NEW", 1000, 10, "Marca 2"],
        ],
        "Vendas Alvo": [["cod_produto", "desc_produto", "qtd_total"], ["KNOWN", "Produto conhecido", 10], ["NEW", "Produto novo", 5]],
        "Volumetria_Equipamentos": [["tipo_equipamento", "capacidade_l"], ["prateleira", 25]],
        "Configuracoes_Operacionais": [["parametro", "valor"], ["limite_peso_kg", 0.7]],
        "Dicionario_Categorias": [["categoria_site", "grupo"], ["Bebidas", "bebidas"]],
    }
    mix_values = {
        "Sheet1": [["product_code", "product_name", "quantidade"], ["NEW", "Produto novo", 3]],
    }
    target_values = {"Base_Produtos": [enrichment_pipeline.BASE_OUTPUT_HEADERS], "Plano_Enderecamento_Final": [["location_id"]]}
    clients = {"master": _FakeClient(master_values), "mix": _FakeClient(mix_values), "target": _FakeClient(target_values)}

    original_client = enrichment_pipeline.GSheetsClient
    enrichment_pipeline.GSheetsClient = lambda sheet_id: clients[sheet_id]
    try:
        result = enrichment_pipeline.run_etl_to_base_products("master", "mix", "target")
    finally:
        enrichment_pipeline.GSheetsClient = original_client

    assert result["success"] is True
    output = clients["target"].read_values("Base_Produtos")
    headers = output[0]
    new_row = output[1]
    assert new_row[headers.index("categoria_site")] == ""
    assert new_row[headers.index("subcategoria")] == "Drinks Prontos"
    assert new_row[headers.index("grupo")] == "bebidas"


def test_run_etl_does_not_fill_group_from_broad_subcategory():
    master_values = {
        "Degelo": [["cod_produto", "degelo"], ["KNOWN", ""], ["NEW", ""]],
        "Categoria ChatGPT": [["cod_produto", "Categoria_Correta"], ["KNOWN", "Itens de prateleira"], ["NEW", "Itens de prateleira"]],
        "Categoria Site": [["cod_produto", "categoria"], ["KNOWN", "Limpeza"]],
        "Subcategorias": [["product_code", "subcategoria"], ["KNOWN", "Preços Incríveis"], ["NEW", "Preços Incríveis"]],
        "volumetria e fabricantes": [["cod_produto", "volume_cm3", "altura_cm", "fabricante"], ["NEW", 1000, 10, "Marca"]],
        "Vendas Alvo": [["cod_produto", "desc_produto", "qtd_total"], ["NEW", "Produto novo", 5]],
        "Volumetria_Equipamentos": [["tipo_equipamento", "capacidade_l"], ["prateleira", 25]],
        "Configuracoes_Operacionais": [["parametro", "valor"], ["limite_peso_kg", 0.7]],
        "Dicionario_Categorias": [["categoria_site", "grupo"], ["Limpeza", "quimico"]],
    }
    mix_values = {"Sheet1": [["product_code", "product_name", "quantidade"], ["NEW", "Produto novo", 3]]}
    target_values = {"Base_Produtos": [enrichment_pipeline.BASE_OUTPUT_HEADERS], "Plano_Enderecamento_Final": [["location_id"]]}
    clients = {"master": _FakeClient(master_values), "mix": _FakeClient(mix_values), "target": _FakeClient(target_values)}

    original_client = enrichment_pipeline.GSheetsClient
    enrichment_pipeline.GSheetsClient = lambda sheet_id: clients[sheet_id]
    try:
        result = enrichment_pipeline.run_etl_to_base_products("master", "mix", "target")
    finally:
        enrichment_pipeline.GSheetsClient = original_client

    assert result["success"] is True
    output = clients["target"].read_values("Base_Produtos")
    headers = output[0]
    assert output[1][headers.index("grupo")] == "neutro"


def test_run_etl_defaults_missing_group_to_neutro():
    master_values = {
        "Degelo": [["cod_produto", "degelo"], ["NEW", ""]],
        "Categoria ChatGPT": [["cod_produto", "Categoria_Correta"], ["NEW", "Itens de prateleira"]],
        "Categoria Site": [["cod_produto", "categoria"]],
        "Subcategorias": [["product_code", "subcategoria"], ["NEW", "Subcategoria Nova"]],
        "volumetria e fabricantes": [["cod_produto", "volume_cm3", "altura_cm", "fabricante"], ["NEW", 1000, 10, "Marca"]],
        "Vendas Alvo": [["cod_produto", "desc_produto", "qtd_total"], ["NEW", "Produto novo", 5]],
        "Volumetria_Equipamentos": [["tipo_equipamento", "capacidade_l"], ["prateleira", 25]],
        "Configuracoes_Operacionais": [["parametro", "valor"], ["limite_peso_kg", 0.7]],
        "Dicionario_Categorias": [["categoria_site", "grupo"], ["Bebidas", "bebidas"]],
    }
    mix_values = {"Sheet1": [["product_code", "product_name", "quantidade"], ["NEW", "Produto novo", 3]]}
    target_values = {"Base_Produtos": [enrichment_pipeline.BASE_OUTPUT_HEADERS], "Plano_Enderecamento_Final": [["location_id"]]}
    clients = {"master": _FakeClient(master_values), "mix": _FakeClient(mix_values), "target": _FakeClient(target_values)}

    original_client = enrichment_pipeline.GSheetsClient
    enrichment_pipeline.GSheetsClient = lambda sheet_id: clients[sheet_id]
    try:
        result = enrichment_pipeline.run_etl_to_base_products("master", "mix", "target")
    finally:
        enrichment_pipeline.GSheetsClient = original_client

    assert result["success"] is True
    output = clients["target"].read_values("Base_Produtos")
    headers = output[0]
    assert output[1][headers.index("grupo")] == "neutro"


def test_slot_volume_model_uses_caixa_when_method_is_caixa():
    row = {
        "product_code": "SKUCX",
        "quantidade": 50,
        "metodo": "caixa",
        "caixas_necessarias": 8,
        "caixa_volume_cm3_final": 4000,
        "vol_L_unitario": 0.8,
        "escaninhos_necessarios": 4,
    }
    model = _resolve_slot_volume_model(row, row)
    assert model["metodo"] == "caixa"
    assert model["required_bins"] == 4
    assert model["logical_count_total"] == 8
    assert model["logical_unit_volume_l"] == 4.0
    assert model["volume_total_l"] == 32.0


def test_slot_quantity_and_volume_respects_precomputed_cascade_values():
    row = {
        "product_code": "SKU1",
        "quantidade": 50,
        "metodo": "unitario",
        "vol_L_unitario": 1.5,
        "escaninhos_necessarios": 4,
        "quantidade_neste_escaninho": 10.922666,
        "volume_neste_escaninho_l": 16.384,
    }
    total_count, required_bins, unit_volume, total_volume, volume_in_bin = _slot_quantity_and_volume(row, row)
    assert total_count == 50
    assert required_bins == 4
    assert unit_volume == 1.5
    assert total_volume == 75.0
    assert volume_in_bin == 16.384
