"""
Tests for the three fixes:
1. refresh_single_etl_warning must call ensure_sheet before reading Base_Produtos
   (prevents "Unable to parse range: Base_Produtos" when tab doesn't exist yet)
2. Prateleira products: escaninhos_necessarios capped at 7
3. Geladeira products (degelo=PODE): escaninhos_necessarios capped at 5
"""
from __future__ import annotations

from typing import Any

import pytest

from core.data_prep import build_base_produtos_map
from core.enrichment_pipeline import _apply_escaninhos_cap, refresh_single_etl_warning


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _FakeClient:
    """Minimal GSheetsClient stub that tracks ensure_sheet calls."""

    def __init__(self, values_by_sheet: dict[str, list[list[Any]]] | None = None):
        self._values: dict[str, list[list[Any]]] = dict(values_by_sheet or {})
        self.ensured: list[str] = []

    def ensure_sheet(self, name: str) -> None:
        self.ensured.append(name)
        self._values.setdefault(name, [])

    def read_values(self, name: str) -> list[list[Any]]:
        if name not in self._values:
            # Simulate the Google Sheets 400 error when tab doesn't exist
            raise RuntimeError(f'Unable to parse range: {name}')
        return self._values.get(name, [])

    def list_sheet_names(self) -> list[str]:
        return list(self._values.keys())

    def clear_sheet(self, name: str) -> None:
        self._values[name] = []

    def append_rows(self, name: str, rows: list[list[Any]]) -> None:
        self._values[name] = rows

    def get_sheet_url(self, name: str) -> str:
        return f"https://fake/{name}"

    def get_title(self) -> str:
        return "Fake"


def _make_base_produtos_row(
    product_code: str,
    categoria_armazenagem: str,
    degelo: str,
    escaninhos: int,
    quantidade: int = 5,
) -> dict[str, Any]:
    return {
        "product_code": product_code,
        "categoria_armazenagem": categoria_armazenagem,
        "degelo": degelo,
        "escaninhos_necessarios": str(escaninhos),
        "quantidade": str(quantidade),
        "is_pesado": "NAO",
        "is_fragil": "NAO",
        "altura_cm": "10",
        "categoria_site": "mercearia",
    }


# ---------------------------------------------------------------------------
# Fix 1 — ensure_sheet must be called before reading Base_Produtos
# ---------------------------------------------------------------------------

def test_refresh_single_etl_warning_calls_ensure_sheet_before_read(monkeypatch):
    """
    When Base_Produtos doesn't exist yet, refresh_single_etl_warning must call
    ensure_sheet first, so read_values never sees a missing tab.
    """
    ensure_order: list[str] = []

    class TrackedClient(_FakeClient):
        def ensure_sheet(self, name: str) -> None:
            ensure_order.append(f"ensure:{name}")
            super().ensure_sheet(name)

        def read_values(self, name: str) -> list[list[Any]]:
            ensure_order.append(f"read:{name}")
            return super().read_values(name)

    target_client = TrackedClient()  # no Base_Produtos tab initially

    # Patch GSheetsClient constructor to return our stubs
    def _fake_client(sheet_id: str):
        if sheet_id == "target_id":
            return target_client
        # master / mix return empty data
        return _FakeClient(
            {
                "Degelo": [["product_code", "degelo"], ["P1", "PODE"]],
                "Categoria ChatGPT": [],
                "Categoria Site": [],
                "Subcategorias": [],
                "volumetria e fabricantes": [],
                "Volumetria_Equipamentos": [],
                "Configuracoes_Operacionais": [],
                "Dicionario_Categorias": [],
                "Mix": [["product_code", "product_name", "quantidade"], ["P1", "Prod 1", "1"]],
            }
        )

    import core.enrichment_pipeline as ep
    monkeypatch.setattr(ep, "GSheetsClient", _fake_client)

    # Should not raise even though Base_Produtos didn't exist before the call
    result = refresh_single_etl_warning(
        master_sheet_id="master_id",
        mix_sheet_id="mix_id",
        target_sheet_id="target_id",
        warning_type="volumetria_vazia",
    )
    assert result.get("success") is True

    # ensure_sheet must appear before the first read of Base_Produtos
    base_ensure_positions = [i for i, e in enumerate(ensure_order) if e == "ensure:Base_Produtos"]
    base_read_positions = [i for i, e in enumerate(ensure_order) if e == "read:Base_Produtos"]
    assert base_ensure_positions, "ensure_sheet('Base_Produtos') was never called"
    assert base_read_positions, "read_values('Base_Produtos') was never called"
    assert base_ensure_positions[0] < base_read_positions[0], (
        "ensure_sheet must be called before read_values for Base_Produtos"
    )


# ---------------------------------------------------------------------------
# Fix 2 — Prateleira products: escaninhos capped at 7 in data_prep
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw_esc,expected", [
    (5, 5),   # below cap → unchanged
    (7, 7),   # exactly at cap → unchanged
    (8, 7),   # above cap → capped at 7
    (15, 7),  # well above cap → capped at 7
])
def test_prateleira_escaninhos_capped_at_7_data_prep(raw_esc, expected):
    rows = [_make_base_produtos_row("P1", "Itens de prateleira", "NAO", raw_esc)]
    result = build_base_produtos_map(rows, {}, 28.0, 12.5)
    assert "P1" in result
    assert int(float(str(result["P1"]["escaninhos_necessarios"]))) == expected, (
        f"Prateleira with raw={raw_esc} should be capped at {expected}"
    )


# ---------------------------------------------------------------------------
# Fix 3 — Geladeira products (degelo=PODE): escaninhos capped at 5 in data_prep
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("raw_esc,expected", [
    (3, 3),   # below cap → unchanged
    (5, 5),   # exactly at cap → unchanged
    (6, 5),   # above cap → capped at 5
    (10, 5),  # well above cap → capped at 5
])
def test_geladeira_pode_escaninhos_capped_at_5_data_prep(raw_esc, expected):
    rows = [_make_base_produtos_row("G1", "Geladeira", "PODE", raw_esc)]
    result = build_base_produtos_map(rows, {}, 28.0, 12.5)
    assert "G1" in result
    assert int(float(str(result["G1"]["escaninhos_necessarios"]))) == expected, (
        f"Geladeira PODE with raw={raw_esc} should be capped at {expected}"
    )


def test_geladeira_nao_escaninhos_not_capped():
    """Geladeira with degelo=NAO should NOT be capped by the geladeira rule."""
    rows = [_make_base_produtos_row("G2", "Geladeira", "NAO", 10)]
    result = build_base_produtos_map(rows, {}, 28.0, 12.5)
    assert "G2" in result
    assert int(float(str(result["G2"]["escaninhos_necessarios"]))) == 10


# ---------------------------------------------------------------------------
# Fix 2 & 3 — _apply_escaninhos_cap in enrichment_pipeline
# ---------------------------------------------------------------------------

def _make_cap_rows(cat: str, degelo: str, esc: int) -> list[list[Any]]:
    return [
        ["escaninhos_necessarios", "categoria_armazenagem", "degelo"],
        [str(esc), cat, degelo],
    ]


@pytest.mark.parametrize("raw,expected", [(5, 5), (7, 7), (8, 7), (20, 7)])
def test_apply_escaninhos_cap_prateleira(raw, expected):
    rows = _make_cap_rows("Itens de prateleira", "NAO", raw)
    headers = rows[0]
    _apply_escaninhos_cap(rows, headers)
    assert int(float(str(rows[1][0]))) == expected


@pytest.mark.parametrize("raw,expected", [(3, 3), (5, 5), (6, 5), (10, 5)])
def test_apply_escaninhos_cap_geladeira_pode(raw, expected):
    rows = _make_cap_rows("Geladeira", "PODE", raw)
    headers = rows[0]
    _apply_escaninhos_cap(rows, headers)
    assert int(float(str(rows[1][0]))) == expected


def test_apply_escaninhos_cap_geladeira_nao_not_capped():
    rows = _make_cap_rows("Geladeira", "NAO", 10)
    headers = rows[0]
    _apply_escaninhos_cap(rows, headers)
    assert int(float(str(rows[1][0]))) == 10
