"""Testes para a lógica de filtros de produtos."""
from __future__ import annotations

from core.filters import FilterSpec, _categoria_matches, _curva_final, _grupo_matches, filter_products


# ── _categoria_matches ────────────────────────────────────────────────────────

class TestCategoriaMatches:
    def test_geladeira_bate_refrigerado(self):
        assert _categoria_matches("refrigerado", "geladeira") is True

    def test_geladeira_bate_string_com_geladeira(self):
        assert _categoria_matches("geladeira_alta", "geladeira") is True

    def test_geladeira_nao_bate_seco(self):
        assert _categoria_matches("seco", "geladeira") is False

    def test_prateleira_bate_seco(self):
        assert _categoria_matches("seco", "prateleira") is True

    def test_prateleira_bate_string_com_prateleira(self):
        assert _categoria_matches("prateleira lateral", "prateleira") is True

    def test_prateleira_nao_bate_refrigerado(self):
        assert _categoria_matches("refrigerado", "prateleira") is False

    def test_freezer_bate_congelado(self):
        assert _categoria_matches("congelado", "freezer") is True

    def test_freezer_bate_string_com_freezer(self):
        assert _categoria_matches("freezer_vertical", "freezer") is True

    def test_freezer_nao_bate_seco(self):
        assert _categoria_matches("seco", "freezer") is False

    def test_filtro_desconhecido_retorna_false(self):
        assert _categoria_matches("seco", "outro") is False


# ── _grupo_matches ────────────────────────────────────────────────────────────

class TestGrupoMatches:
    def test_flv_bate_flv(self):
        assert _grupo_matches("flv", "flv") is True

    def test_flvs_bate_flvs(self):
        assert _grupo_matches("flvs", "flvs") is True

    def test_bebidas_bate_bebidas(self):
        assert _grupo_matches("bebidas", "bebidas") is True

    def test_alimento_bate_alimento(self):
        assert _grupo_matches("alimento", "alimento") is True

    def test_quimico_bate_quimicos(self):
        assert _grupo_matches("quimico", "quimicos") is True

    def test_quimico_bate_quimico(self):
        assert _grupo_matches("quimico", "quimico") is True

    def test_perfumaria_bate_perfumaria(self):
        assert _grupo_matches("perfumaria", "perfumaria") is True

    def test_quimico_perfumaria_bate_quimico(self):
        assert _grupo_matches("quimico", "quimico_perfumaria") is True

    def test_quimico_perfumaria_bate_perfumaria(self):
        assert _grupo_matches("perfumaria", "quimico_perfumaria") is True

    def test_neutro_bate_neutro(self):
        assert _grupo_matches("neutro", "neutro") is True

    def test_alimento_nao_bate_bebidas(self):
        assert _grupo_matches("alimento", "bebidas") is False

    def test_filtro_desconhecido_retorna_false(self):
        assert _grupo_matches("alimento", "desconhecido") is False


# ── _curva_final ──────────────────────────────────────────────────────────────

class TestCurvaFinal:
    def test_curva_letra_retorna_maiuscula(self):
        assert _curva_final("a", None) == "A"

    def test_curva_letra_b(self):
        assert _curva_final("B", None) == "B"

    def test_curva_vazia_retorna_string_vazia(self):
        assert _curva_final("", None) == ""

    def test_curva_none_retorna_string_vazia(self):
        assert _curva_final(None, None) == ""

    def test_curva_numerica_com_fabricante_letra_usa_fabricante(self):
        # curva="1" é numérico, nm_fabricante="A" (letra) → usa fabricante
        assert _curva_final("1", "A") == "A"

    def test_curva_texto_longo_retorna_uppercased(self):
        assert _curva_final("XYZ", None) == "XYZ"


# ── filter_products ───────────────────────────────────────────────────────────

def _product(code: str, name: str, **kwargs) -> dict:
    return {"product_code": code, "product_name": name, **kwargs}


def _data_map(*products) -> dict:
    return {p["product_code"]: p for p in products}


class TestFilterQuery:
    def test_sem_filtro_retorna_todos(self):
        prods = [_product("A", "Arroz"), _product("B", "Feijao")]
        result = filter_products(prods, _data_map(*prods), FilterSpec())
        assert len(result) == 2

    def test_query_por_nome_filtra(self):
        prods = [_product("A", "Arroz"), _product("B", "Feijao")]
        result = filter_products(prods, _data_map(*prods), FilterSpec(query="arroz"))
        assert len(result) == 1
        assert result[0]["product_code"] == "A"

    def test_query_por_codigo_filtra(self):
        prods = [_product("SKU001", "Arroz"), _product("SKU002", "Feijao")]
        result = filter_products(prods, _data_map(*prods), FilterSpec(query="sku001"))
        assert len(result) == 1

    def test_query_sem_match_retorna_vazio(self):
        prods = [_product("A", "Arroz")]
        result = filter_products(prods, {}, FilterSpec(query="inexistente"))
        assert result == []

    def test_produto_sem_nome_e_ignorado(self):
        prods = [{"product_code": "X", "product_name": ""}]
        result = filter_products(prods, {}, FilterSpec())
        assert result == []


class TestFilterGrupo:
    def test_filtro_por_grupo_alimento(self):
        alim = _product("A", "Arroz", grupo="alimento")
        quim = _product("B", "Deterg", grupo="quimico")
        result = filter_products([alim, quim], _data_map(alim, quim), FilterSpec(selected_grupos=["alimento"]))
        assert len(result) == 1
        assert result[0]["product_code"] == "A"

    def test_filtro_por_categoria_geladeira(self):
        frio = _product("A", "Leite", categoria_armazenagem="refrigerado")
        seco = _product("B", "Arroz", categoria_armazenagem="seco")
        result = filter_products(
            [frio, seco], _data_map(frio, seco),
            FilterSpec(selected_grupos=["geladeira"])
        )
        assert len(result) == 1
        assert result[0]["product_code"] == "A"

    def test_filtro_por_categoria_prateleira(self):
        frio = _product("A", "Leite", categoria_armazenagem="refrigerado")
        seco = _product("B", "Arroz", categoria_armazenagem="seco")
        result = filter_products(
            [frio, seco], _data_map(frio, seco),
            FilterSpec(selected_grupos=["prateleira"])
        )
        assert len(result) == 1
        assert result[0]["product_code"] == "B"


class TestFilterTipo:
    def test_filtra_produtos_altos(self):
        alto = _product("A", "Prod Alto", is_alto=True)
        baixo = _product("B", "Prod Baixo", is_alto=False)
        result = filter_products([alto, baixo], _data_map(alto, baixo), FilterSpec(filter_tipo="alto"))
        assert len(result) == 1 and result[0]["product_code"] == "A"

    def test_filtra_produtos_pesados(self):
        pesado = _product("A", "Pesado", is_pesado=True)
        leve = _product("B", "Leve", is_pesado=False)
        result = filter_products([pesado, leve], _data_map(pesado, leve), FilterSpec(filter_tipo="pesado"))
        assert len(result) == 1 and result[0]["product_code"] == "A"

    def test_filtra_nao_alto(self):
        alto = _product("A", "Alto", is_alto=True)
        baixo = _product("B", "Baixo", is_alto=False)
        result = filter_products([alto, baixo], _data_map(alto, baixo), FilterSpec(filter_tipo="nao-alto"))
        assert len(result) == 1 and result[0]["product_code"] == "B"

    def test_filtra_alto_e_pesado(self):
        ambos = _product("A", "Ambos", is_alto=True, is_pesado=True)
        so_alto = _product("B", "SoAlto", is_alto=True, is_pesado=False)
        result = filter_products([ambos, so_alto], _data_map(ambos, so_alto), FilterSpec(filter_tipo="alto-e-pesado"))
        assert len(result) == 1 and result[0]["product_code"] == "A"

    def test_filtra_alto_ou_pesado(self):
        ambos = _product("A", "Ambos", is_alto=True, is_pesado=True)
        nenhum = _product("B", "Nenhum", is_alto=False, is_pesado=False)
        result = filter_products([ambos, nenhum], _data_map(ambos, nenhum), FilterSpec(filter_tipo="alto-pesado"))
        assert len(result) == 1 and result[0]["product_code"] == "A"


class TestFilterCurva:
    def test_filtra_curva_a(self):
        ca = _product("A", "ProdA", curva="A")
        cb = _product("B", "ProdB", curva="B")
        result = filter_products([ca, cb], _data_map(ca, cb), FilterSpec(filter_curva="A"))
        assert len(result) == 1 and result[0]["product_code"] == "A"

    def test_filtra_curva_multipla_com_mais(self):
        ca = _product("A", "ProdA", curva="A")
        cb = _product("B", "ProdB", curva="B")
        cc = _product("C", "ProdC", curva="C")
        result = filter_products([ca, cb, cc], _data_map(ca, cb, cc), FilterSpec(filter_curva="A+B"))
        codes = {r["product_code"] for r in result}
        assert codes == {"A", "B"}

    def test_filtra_sem_curva(self):
        sem = _product("A", "SemCurva", curva=None)
        com = _product("B", "ComCurva", curva="A")
        result = filter_products([sem, com], _data_map(sem, com), FilterSpec(filter_curva="sem"))
        assert len(result) == 1 and result[0]["product_code"] == "A"


class TestFilterFragilEDegelo:
    def test_filtra_fragil_sim(self):
        fragil = _product("A", "Fragil", is_fragil="SIM")
        normal = _product("B", "Normal", is_fragil="NAO")
        result = filter_products([fragil, normal], _data_map(fragil, normal), FilterSpec(filter_fragil="sim"))
        assert len(result) == 1 and result[0]["product_code"] == "A"

    def test_filtra_fragil_nao(self):
        fragil = _product("A", "Fragil", is_fragil="SIM")
        normal = _product("B", "Normal", is_fragil="NAO")
        result = filter_products([fragil, normal], _data_map(fragil, normal), FilterSpec(filter_fragil="nao"))
        assert len(result) == 1 and result[0]["product_code"] == "B"

    def test_filtra_degelo_nao(self):
        nao = _product("A", "Degelo NAO", degelo="NAO")
        pode = _product("B", "Degelo PODE", degelo="PODE")
        result = filter_products([nao, pode], _data_map(nao, pode), FilterSpec(filter_degelo="nao"))
        assert len(result) == 1 and result[0]["product_code"] == "A"


class TestFilterSubcategoria:
    def test_filtra_por_subcategoria(self):
        laticinios = _product("A", "Leite", subcategoria="laticinios")
        padaria = _product("B", "Pao", subcategoria="padaria")
        result = filter_products(
            [laticinios, padaria], _data_map(laticinios, padaria),
            FilterSpec(selected_subcategorias=["laticinios"])
        )
        assert len(result) == 1 and result[0]["product_code"] == "A"
