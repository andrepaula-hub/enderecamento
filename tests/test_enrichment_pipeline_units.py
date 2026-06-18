"""Testes unitários para funções puras de enrichment_pipeline.

Cobre funções que não precisam de GSheets: utilidades de conversão,
extração de dados de DataFrames, e lógica de classificação.
"""
from __future__ import annotations

import pandas as pd
import pytest

from core.enrichment_pipeline import (
    _extract_allocated_codes_from_plano_values,
    _extract_duplicated_codes,
    _extract_weight_from_name,
    _find_header_index,
    _norm,
    _norm_code,
    _pick_col,
    _prune_plan_values_to_valid_codes,
    _safe_df,
    _strip_accents,
    _tipo_equipamento_base,
    _to_float,
    _to_float_cm3,
    _to_int,
)


# ── _strip_accents / _norm ────────────────────────────────────────────────────

class TestNormUtils:
    def test_strip_accents_remove_acento(self):
        assert _strip_accents("café") == "cafe"

    def test_strip_accents_sem_acento_inalterado(self):
        assert _strip_accents("hello") == "hello"

    def test_norm_caixa_baixa_e_sem_acento(self):
        assert _norm("Arroz Integral") == "arroz integral"

    def test_norm_remove_espacos_duplos(self):
        assert _norm("a  b") == "a b"

    def test_norm_none_retorna_vazio(self):
        assert _norm(None) == ""

    def test_norm_code_upper(self):
        assert _norm_code("sku001") == "SKU001"

    def test_norm_code_none_retorna_vazio(self):
        assert _norm_code(None) == ""


# ── _to_float ─────────────────────────────────────────────────────────────────

class TestToFloat:
    def test_inteiro(self):
        assert _to_float(5) == 5.0

    def test_string_decimal_virgula(self):
        assert _to_float("3,14") == pytest.approx(3.14, rel=1e-3)

    def test_none_retorna_default(self):
        assert _to_float(None) == 0.0

    def test_default_customizado(self):
        assert _to_float(None, default=99.0) == 99.0

    def test_string_invalida_retorna_default(self):
        assert _to_float("abc") == 0.0


# ── _to_float_cm3 ─────────────────────────────────────────────────────────────

class TestToFloatCm3:
    def test_numero_simples(self):
        assert _to_float_cm3("1500") == pytest.approx(1500.0)

    def test_string_vazia_retorna_default(self):
        assert _to_float_cm3("") == 0.0

    def test_none_retorna_default(self):
        assert _to_float_cm3(None) == 0.0

    def test_formato_milhar_com_ponto(self):
        # "1.500" sem vírgula e com padrão de milhar → interpreta como 1500
        result = _to_float_cm3("1.500")
        assert result == pytest.approx(1500.0)

    def test_formato_decimal_normal(self):
        assert _to_float_cm3("1,5") == pytest.approx(1.5, rel=1e-3)


# ── _to_int ───────────────────────────────────────────────────────────────────

class TestToInt:
    def test_inteiro(self):
        assert _to_int(3) == 3

    def test_float_arredonda(self):
        assert _to_int(2.7) == 3

    def test_none_retorna_default(self):
        assert _to_int(None) == 0

    def test_default_customizado(self):
        assert _to_int(None, default=5) == 5

    def test_string_numerica(self):
        assert _to_int("10") == 10

    def test_string_invalida_retorna_default(self):
        assert _to_int("xyz") == 0


# ── _safe_df ──────────────────────────────────────────────────────────────────

class TestSafeDf:
    def test_lista_vazia_retorna_df_vazio(self):
        assert _safe_df([]).empty

    def test_so_headers_sem_dados_retorna_df_vazio_com_cols(self):
        df = _safe_df([["col_a", "col_b"]])
        assert list(df.columns) == ["col_a", "col_b"]
        assert len(df) == 0

    def test_dados_normais(self):
        df = _safe_df([["a", "b"], [1, 2], [3, 4]])
        assert len(df) == 2
        assert list(df.columns) == ["a", "b"]

    def test_linha_curta_preenche_none(self):
        df = _safe_df([["a", "b", "c"], [1, 2]])
        assert df.iloc[0]["c"] is None


# ── _find_header_index ────────────────────────────────────────────────────────

class TestFindHeaderIndex:
    def test_encontra_candidato(self):
        headers = ["location_id", "product_code", "curva"]
        assert _find_header_index(headers, ["product_code"]) == 1

    def test_candidato_ausente_retorna_menos_um(self):
        headers = ["location_id", "product_code"]
        assert _find_header_index(headers, ["nome_produto"]) == -1

    def test_multiplos_candidatos_primeiro_match(self):
        headers = ["product_code", "cod_produto"]
        assert _find_header_index(headers, ["cod_produto", "product_code"]) == 1

    def test_case_insensitive_via_norm(self):
        headers = ["Product_Code"]
        assert _find_header_index(headers, ["product_code"]) == 0


# ── _pick_col ─────────────────────────────────────────────────────────────────

class TestPickCol:
    def test_encontra_coluna_existente(self):
        df = pd.DataFrame({"product_code": ["SKU001"], "curva": ["A"]})
        assert _pick_col(df, ["product_code"]) == "product_code"

    def test_retorna_none_se_ausente(self):
        df = pd.DataFrame(columns=["a", "b"])
        assert _pick_col(df, ["z"]) is None

    def test_df_vazio_retorna_none(self):
        assert _pick_col(pd.DataFrame(), ["qualquer"]) is None


# ── _extract_weight_from_name ─────────────────────────────────────────────────

class TestExtractWeightFromName:
    def test_kg(self):
        assert _extract_weight_from_name("Arroz 5KG") == pytest.approx(5.0)

    def test_gramas_convertido_para_kg(self):
        assert _extract_weight_from_name("Sal 500G") == pytest.approx(0.5)

    def test_litros(self):
        assert _extract_weight_from_name("Leite 1L") == pytest.approx(1.0)

    def test_mililitros_convertido(self):
        assert _extract_weight_from_name("Suco 200ML") == pytest.approx(0.2)

    def test_sem_unidade_retorna_zero(self):
        assert _extract_weight_from_name("Produto Generico") == 0.0

    def test_string_vazia_retorna_zero(self):
        assert _extract_weight_from_name("") == 0.0

    def test_decimal_com_virgula(self):
        assert _extract_weight_from_name("Azeite 0,5L") == pytest.approx(0.5)


# ── _tipo_equipamento_base ────────────────────────────────────────────────────

class TestTipoEquipamentoBase:
    def test_freezer_por_categoria(self):
        assert _tipo_equipamento_base("freezer", "") == "freezer"

    def test_congelado_vira_freezer(self):
        assert _tipo_equipamento_base("congelado", "") == "freezer"

    def test_refrigerado_vira_geladeira(self):
        assert _tipo_equipamento_base("refrigerado", "") == "geladeira"

    def test_refrigerado_com_degelo_pode_vira_geladeira_alta(self):
        assert _tipo_equipamento_base("refrigerado", "PODE") == "geladeira_alta"

    def test_lateral_vira_prateleira_lateral(self):
        assert _tipo_equipamento_base("lateral", "") == "prateleira_lateral"

    def test_seco_vira_prateleira(self):
        assert _tipo_equipamento_base("seco", "") == "prateleira"

    def test_desconhecido_vira_prateleira(self):
        assert _tipo_equipamento_base("outro", "") == "prateleira"


# ── _extract_duplicated_codes ─────────────────────────────────────────────────

class TestExtractDuplicatedCodes:
    def test_sem_duplicatas_retorna_vazio(self):
        df = pd.DataFrame({"product_code": ["A", "B", "C"]})
        assert _extract_duplicated_codes(df) == []

    def test_com_duplicata(self):
        df = pd.DataFrame({"product_code": ["A", "B", "A"]})
        result = _extract_duplicated_codes(df)
        assert result == ["A"]

    def test_df_sem_coluna_retorna_vazio(self):
        df = pd.DataFrame({"nome": ["A", "B"]})
        assert _extract_duplicated_codes(df) == []

    def test_df_vazio_retorna_vazio(self):
        assert _extract_duplicated_codes(pd.DataFrame()) == []

    def test_multiplos_duplicados_ordenados(self):
        df = pd.DataFrame({"product_code": ["B", "A", "B", "A", "C"]})
        result = _extract_duplicated_codes(df)
        assert result == ["A", "B"]


# ── _extract_allocated_codes_from_plano_values ────────────────────────────────

class TestExtractAllocatedCodes:
    def test_lista_vazia_retorna_set_vazio(self):
        assert _extract_allocated_codes_from_plano_values([]) == set()

    def test_so_header_retorna_set_vazio(self):
        result = _extract_allocated_codes_from_plano_values([["location_id", "product_code"]])
        assert result == set()

    def test_extrai_codigo_alocado(self):
        values = [
            ["location_id", "product_code"],
            ["R1E1-A1", "SKU001"],
        ]
        result = _extract_allocated_codes_from_plano_values(values)
        assert "SKU001" in result

    def test_ignora_unallocated(self):
        values = [
            ["location_id", "product_code"],
            ["UNALLOCATED", "SKU001"],
        ]
        result = _extract_allocated_codes_from_plano_values(values)
        assert "SKU001" not in result

    def test_ignora_vazio(self):
        values = [
            ["location_id", "product_code"],
            ["R1E1-A1", "Vazio"],
        ]
        result = _extract_allocated_codes_from_plano_values(values)
        assert "VAZIO" not in result

    def test_multiplos_produtos(self):
        values = [
            ["location_id", "product_code"],
            ["R1E1-A1", "SKU001"],
            ["R1E2-A1", "SKU002"],
            ["UNALLOCATED", "SKU003"],
        ]
        result = _extract_allocated_codes_from_plano_values(values)
        assert result == {"SKU001", "SKU002"}


# ── _prune_plan_values_to_valid_codes ─────────────────────────────────────────

class TestPrunePlanValues:
    def test_limpa_skus_fora_do_mix_sem_apagar_linhas(self):
        values = [
            ["location_id", "product_code", "product_name", "slot1_code", "slot1_name", "slot2_code", "slot2_name", "slot_count", "slot_duplo"],
            ["R1-E1-1-1", "SKU_OLD", "Produto antigo", "SKU_OLD", "Produto antigo", "SKU_OK", "Produto ok", 2, "SIM"],
            ["R1-E1-1-2", "SKU_OK", "Produto ok", "SKU_OK", "Produto ok", "", "", 1, "NAO"],
        ]

        pruned, removed = _prune_plan_values_to_valid_codes(values, {"SKU_OK"})

        assert removed == 2
        assert len(pruned) == len(values)
        assert pruned[1][1] == "Vazio"
        assert pruned[1][2] == ""
        assert pruned[1][3] == ""
        assert pruned[1][4] == ""
        assert pruned[1][5] == "SKU_OK"
        assert pruned[1][7] == 1
        assert pruned[1][8] == "NAO"
        assert pruned[2][1] == "SKU_OK"
