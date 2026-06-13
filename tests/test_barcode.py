"""Testes para busca de produto por código de barras."""
from __future__ import annotations

from core.barcode import get_product_by_barcode

CATALOG = [
    {"barcode": "7891234567890", "cod_produto": "SKU001", "nome": "Produto A", "categoria": "Alimento"},
    {"barcode": "1112223334445", "cod_produto": "SKU002", "nome": "Produto B", "categoria": "Bebidas"},
    {"cod_produto": "SKU003", "nome": "Produto C", "categoria": "Quimico"},  # sem campo barcode
]


class _FakeSource:
    def __init__(self, rows=None, raise_error=False):
        self._rows = rows if rows is not None else CATALOG
        self._raise = raise_error

    def read_sheet(self, name):
        if self._raise:
            raise RuntimeError("sheet não encontrada")
        return self._rows


class TestBuscaPorBarcode:
    def test_encontra_produto_existente(self):
        r = get_product_by_barcode(_FakeSource(), "7891234567890")
        assert r["success"] is True
        assert r["product"]["cod_produto"] == "SKU001"

    def test_retorna_nome_correto(self):
        r = get_product_by_barcode(_FakeSource(), "7891234567890")
        assert r["product"]["nome"] == "Produto A"

    def test_retorna_categoria_correta(self):
        r = get_product_by_barcode(_FakeSource(), "7891234567890")
        assert r["product"]["categoria"] == "Alimento"

    def test_segundo_produto_encontrado(self):
        r = get_product_by_barcode(_FakeSource(), "1112223334445")
        assert r["success"] is True
        assert r["product"]["cod_produto"] == "SKU002"

    def test_produto_nao_encontrado_retorna_error(self):
        r = get_product_by_barcode(_FakeSource(), "9999999999999")
        assert r["success"] is False
        assert "não encontrado" in r["error"].lower()

    def test_barcode_vazio_retorna_error(self):
        r = get_product_by_barcode(_FakeSource(), "")
        assert r["success"] is False
        assert "vazio" in r["error"].lower()

    def test_barcode_none_retorna_error(self):
        r = get_product_by_barcode(_FakeSource(), None)
        assert r["success"] is False

    def test_aba_ausente_retorna_error(self):
        r = get_product_by_barcode(_FakeSource(raise_error=True), "7891234567890")
        assert r["success"] is False
        assert "não encontrada" in r["error"].lower()

    def test_catalogo_vazio_retorna_not_found(self):
        r = get_product_by_barcode(_FakeSource(rows=[]), "7891234567890")
        assert r["success"] is False

    def test_busca_pelo_campo_cod_produto_quando_sem_barcode(self):
        # SKU003 não tem campo "barcode", mas tem "cod_produto"
        r = get_product_by_barcode(_FakeSource(), "SKU003")
        assert r["success"] is True
        assert r["product"]["cod_produto"] == "SKU003"

    def test_busca_e_case_sensitive(self):
        # normalize_string preserva o case — busca é sensível a maiúsculas
        source = _FakeSource(rows=[{"barcode": "ABC123", "cod_produto": "X", "nome": "Y", "categoria": "Z"}])
        r_exato = get_product_by_barcode(source, "ABC123")
        r_lower = get_product_by_barcode(source, "abc123")
        assert r_exato["success"] is True
        assert r_lower["success"] is False
