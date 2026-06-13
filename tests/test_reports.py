"""Testes para geração de relatórios SKU (sem Google Sheets)."""
from __future__ import annotations

import csv
import io

import pytest

from core.reports import generate_sku_report_custom

BASE_PRODS = [
    {
        "product_code": "SKU001", "product_name": "Leite Integral", "quantidade": 10,
        "categoria_armazenagem": "refrigerado", "curva": "A", "grupo": "alimento",
        "is_alto": False, "is_pesado": False, "is_pequeno": False,
        "categoria_site": "laticinios",
    },
    {
        "product_code": "SKU002", "product_name": "Arroz Parboilizado", "quantidade": 5,
        "categoria_armazenagem": "seco", "curva": "B", "grupo": "alimento",
        "is_alto": False, "is_pesado": True, "is_pequeno": False,
        "categoria_site": "graos",
    },
    {
        "product_code": "SKU003", "product_name": "Detergente", "quantidade": 8,
        "categoria_armazenagem": "seco", "curva": "C", "grupo": "quimico",
        "is_alto": False, "is_pesado": False, "is_pequeno": True,
        "categoria_site": "quimicos",
    },
    {
        "product_code": "SKU004", "product_name": "Sorvete", "quantidade": 3,
        "categoria_armazenagem": "congelado", "curva": "D", "grupo": "alimento",
        "is_alto": False, "is_pesado": False, "is_pequeno": False,
        "categoria_site": "congelados",
    },
]

PLANO = [
    {"location_id": "R1E1-A1", "product_code": "SKU001", "product_name": "Leite Integral",
     "tipo_equipamento": "geladeira"},
    {"location_id": "R1E2-A1", "product_code": "SKU002", "product_name": "Arroz Parboilizado",
     "tipo_equipamento": "prateleira"},
    {"location_id": "R1E3-A1", "product_code": "SKU004", "product_name": "Sorvete",
     "tipo_equipamento": "freezer"},
]


class _FakeSource:
    def __init__(self, base=None, plano=None):
        self._base = base if base is not None else BASE_PRODS
        self._plano = plano if plano is not None else PLANO

    def read_sheet(self, name: str):
        if name == "Base_Produtos":
            return self._base
        if name == "Plano_Enderecamento_Final":
            return self._plano
        return []


def _parse_csv(csv_content: str) -> list[list[str]]:
    reader = csv.reader(io.StringIO(csv_content))
    return [row for row in reader if row]


# ── geração de CSV ────────────────────────────────────────────────────────────

class TestGeracaoCSV:
    def test_retorna_success_true(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["secos"], ["codigo_sku", "descricao"])
        assert r["success"] is True

    def test_retorna_csv_content(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["secos"], ["codigo_sku"])
        assert "csvContent" in r and r["csvContent"]

    def test_retorna_filename(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["secos"], ["codigo_sku"])
        assert r.get("filename") == "Relatorio_SKUs.csv"

    def test_csv_contem_header(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["secos"], ["codigo_sku", "descricao"])
        rows = _parse_csv(r["csvContent"])
        header_row = next((row for row in rows if row and row[0] in {"codigo_sku", "descricao"}), None)
        assert header_row is not None

    def test_csv_contem_produto_seco(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["secos"], ["codigo_sku"])
        assert "SKU002" in r["csvContent"]

    def test_csv_nao_contem_produto_de_outro_tipo(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["secos"], ["codigo_sku"])
        assert "SKU001" not in r["csvContent"]  # SKU001 é geladeira

    def test_aba_refrigerados_contem_leite(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["refrigerados"], ["codigo_sku"])
        assert "SKU001" in r["csvContent"]

    def test_aba_congelados_contem_sorvete(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["congelados"], ["codigo_sku"])
        assert "SKU004" in r["csvContent"]

    def test_multiples_abas_no_mesmo_csv(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["secos", "refrigerados"], ["codigo_sku"])
        assert "SKU001" in r["csvContent"]
        assert "SKU002" in r["csvContent"]

    def test_aba_nao_alocados_contem_produto_sem_localizacao(self):
        # SKU003 (Detergente) está na base mas não tem linha no plano
        r = generate_sku_report_custom(_FakeSource(), "new", ["nao-alocados"], ["codigo_sku"])
        assert "SKU003" in r["csvContent"]

    def test_produto_alocado_nao_aparece_em_nao_alocados(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["nao-alocados"], ["codigo_sku"])
        assert "SKU001" not in r["csvContent"]

    def test_aba_desconhecida_e_ignorada_sem_erro(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["aba-inexistente"], ["codigo_sku"])
        assert r["success"] is True


class TestColunas:
    def test_coluna_codigo_sku_presente(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["secos"], ["codigo_sku"])
        assert "codigo_sku" in r["csvContent"]

    def test_coluna_descricao_presente(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["secos"], ["descricao"])
        assert "descricao" in r["csvContent"]

    def test_multiplas_colunas_selecionadas(self):
        r = generate_sku_report_custom(_FakeSource(), "new", ["secos"], ["codigo_sku", "curva", "grupo"])
        rows = _parse_csv(r["csvContent"])
        header_row = next((row for row in rows if "codigo_sku" in row), None)
        assert header_row is not None
        assert "curva" in header_row
        assert "grupo" in header_row


class TestFonteSemDados:
    def test_base_vazia_gera_relatorio_sem_crash(self):
        source = _FakeSource(base=[], plano=[])
        r = generate_sku_report_custom(source, "new", ["secos"], ["codigo_sku"])
        assert r["success"] is True

    def test_plano_vazio_todos_nao_alocados(self):
        source = _FakeSource(plano=[])
        r = generate_sku_report_custom(source, "new", ["nao-alocados"], ["codigo_sku"])
        # todos os produtos da base devem aparecer como não alocados
        content = r["csvContent"]
        assert "SKU001" in content
        assert "SKU002" in content
