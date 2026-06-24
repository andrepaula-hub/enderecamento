from __future__ import annotations

from typing import Any

from core import card175_snapshot


class _FakeClient:
    def __init__(self, values_by_sheet: dict[str, list[list[Any]]]):
        self._values_by_sheet = values_by_sheet

    def list_sheet_names(self) -> list[str]:
        return list(self._values_by_sheet.keys())

    def read_values(self, sheet_name: str) -> list[list[Any]]:
        return self._values_by_sheet.get(sheet_name, [])

    def read_sheet(self, sheet_name: str) -> list[dict[str, Any]]:
        values = self.read_values(sheet_name)
        if not values:
            return []
        headers = [str(item) for item in values[0]]
        rows: list[dict[str, Any]] = []
        for raw in values[1:]:
            row = {}
            for idx, header in enumerate(headers):
                row[header] = raw[idx] if idx < len(raw) else None
            rows.append(row)
        return rows

    def ensure_sheet(self, sheet_name: str) -> None:
        self._values_by_sheet.setdefault(sheet_name, [])

    def clear_sheet(self, sheet_name: str) -> None:
        self.ensure_sheet(sheet_name)
        self._values_by_sheet[sheet_name] = []

    def append_rows(self, sheet_name: str, rows: list[list[Any]]) -> None:
        self._values_by_sheet.setdefault(sheet_name, [])
        self._values_by_sheet[sheet_name].extend(rows)

    def get_sheet_url(self, sheet_name: str) -> str:
        return f"https://fake/{sheet_name}"


def test_normalize_card788_rows_accepts_generated_address():
    rows = card175_snapshot._normalize_card175_rows(
        [
            {
                "endereco_generated": "LJ060001-A-A-A",
                "cod_produto": "SHOP69",
                "desc_produto": "ÁGUA MINERAL PRATA SEM GÁS 1,5L",
                "quantidade": 22,
                "data_validade": "18/7/2026",
            }
        ]
    )

    assert rows == [
        {
            "id_localizacao": "LJ060001-A-A-A",
            "galpao": "",
            "rua": "",
            "posicao_pallete": "",
            "escaninho_nivel": "",
            "cod_produto": "SHOP69",
            "desc_produto": "ÁGUA MINERAL PRATA SEM GÁS 1,5L",
            "quantidade": 22.0,
        }
    ]


def test_import_card175_creates_working_plan_from_map_sheet(monkeypatch):
    values_by_sheet = {
        "Mapa_Final_Escaninhos": [
            [
                "location_id",
                "galpao_id",
                "rua_num",
                "equipamento_num",
                "tipo_equipamento",
                "nivel",
                "escaninho_num_no_nivel",
                "capacidade_l",
                "tipo_equipamento_final",
                "product_code",
            ],
            ["LJ1-R1-001-1A", "LJ1", 1, 1, "prateleira", 1, 1, 20, "prateleira", "Vazio"],
        ],
        "Base_Produtos": [
            ["product_code", "product_name", "grupo"],
            ["SKU1", "Produto 1", "alimento"],
        ],
    }
    fake_client = _FakeClient(values_by_sheet)

    monkeypatch.setattr(card175_snapshot, "GSheetsClient", lambda _sheet_id: fake_client)
    monkeypatch.setattr(card175_snapshot, "_set_card175_context", lambda payload: None)

    result = card175_snapshot.import_card175_rows(
        sheet_id="fake-sheet",
        rows=[
            {
                "galpao": "LJ1",
                "rua": "1",
                "posicao_pallete": "1",
                "escaninho_nivel": "1A",
                "cod_produto": "SKU1",
                "desc_produto": "Produto 1",
                "quantidade": 3,
            }
        ],
        source_name="metabase_card_175",
    )

    assert result["success"] is True
    assert card175_snapshot.WORKING_PLAN_SHEET in values_by_sheet
    assert card175_snapshot.CARD175_PLAN_SHEET in values_by_sheet
    working_rows = values_by_sheet[card175_snapshot.WORKING_PLAN_SHEET]
    assert working_rows[1][0] == "LJ1-R1-001-1A"
    assert "SKU1" in working_rows[1]


def test_import_card788_direct_location_id_populates_existing_slot(monkeypatch):
    values_by_sheet = {
        "Plano_Enderecamento_Final": [
            [
                "location_id",
                "galpao_id",
                "rua_num",
                "equipamento_num",
                "tipo_equipamento",
                "nivel",
                "escaninho_num_no_nivel",
                "capacidade_l",
                "tipo_equipamento_final",
                "product_code",
                "product_name",
                "quantidade",
            ],
            ["LJ1-R1-001-1A", "LJ1", 1, 1, "prateleira", 1, 1, 20, "prateleira", "Vazio", "", 0],
        ],
        "Base_Produtos": [
            ["product_code", "product_name", "grupo", "categoria_armazenagem"],
            ["SKU1", "Produto 1", "alimento", "Itens de prateleira"],
        ],
    }
    fake_client = _FakeClient(values_by_sheet)

    monkeypatch.setattr(card175_snapshot, "GSheetsClient", lambda _sheet_id: fake_client)
    monkeypatch.setattr(card175_snapshot, "_set_card175_context", lambda payload: None)

    result = card175_snapshot.import_card175_rows(
        sheet_id="fake-sheet",
        rows=[
            {
                "endereco_generated": "LJ1-R1-001-1A",
                "cod_produto": "SKU1",
                "desc_produto": "Produto 1",
                "quantidade": 3,
            }
        ],
        source_name="metabase_card_788",
    )

    assert result["success"] is True
    assert result["locations_with_data"] == 1
    working_rows = values_by_sheet[card175_snapshot.WORKING_PLAN_SHEET]
    assert working_rows[1][0] == "LJ1-R1-001-1A"
    assert "SKU1" in working_rows[1]


def test_import_card788_external_address_creates_card_only_virtual_equipment(monkeypatch):
    values_by_sheet = {
        "Plano_Enderecamento_Final": [
            [
                "location_id",
                "galpao_id",
                "rua_num",
                "equipamento_num",
                "tipo_equipamento",
                "nivel",
                "escaninho_num_no_nivel",
                "capacidade_l",
                "tipo_equipamento_final",
                "product_code",
                "product_name",
                "quantidade",
                "categoria_armazenagem",
            ],
            ["LJ1-R1-001-1A", "LJ1", 1, 1, "prateleira", 1, 1, 20, "prateleira", "Vazio", "", 0, ""],
        ],
        "Base_Produtos": [
            ["product_code", "product_name", "grupo", "categoria_armazenagem"],
            ["SKU1", "Produto 1", "alimento", "Geladeira"],
            ["SKU2", "Produto 2", "alimento", "Geladeira"],
            ["SKU3", "Produto 3", "alimento", "Geladeira"],
        ],
    }
    fake_client = _FakeClient(values_by_sheet)

    monkeypatch.setattr(card175_snapshot, "GSheetsClient", lambda _sheet_id: fake_client)
    monkeypatch.setattr(card175_snapshot, "_set_card175_context", lambda payload: None)

    result = card175_snapshot.import_card175_rows(
        sheet_id="fake-sheet",
        rows=[
            {"endereco_generated": "LJ1-A-A-A", "cod_produto": "SKU1", "desc_produto": "Produto 1", "quantidade": 3},
            {"endereco_generated": "LJ1-A-A-A", "cod_produto": "SKU2", "desc_produto": "Produto 2", "quantidade": 2},
            {"endereco_generated": "LJ1-A-A-A", "cod_produto": "SKU3", "desc_produto": "Produto 3", "quantidade": 1},
        ],
        source_name="metabase_card_788",
    )

    assert result["success"] is True
    assert result["virtual_rows_added"] == 2
    working_rows = values_by_sheet[card175_snapshot.WORKING_PLAN_SHEET]
    locations = [row[0] for row in working_rows[1:]]
    assert "LJ1-R900-001-1A" in locations
    assert "LJ1-R900-001-1B" in locations
    assert any(row[4] == "geladeira" and row[9] == "SKU1" for row in working_rows[1:])
    assert any(row[9] == "SKU3" for row in working_rows[1:])


def test_import_card175_keeps_virtual_r_addresses_in_working_sheet(monkeypatch):
    values_by_sheet = {
        "Mapa_Final_Escaninhos": [
            [
                "location_id",
                "galpao_id",
                "rua_num",
                "equipamento_num",
                "tipo_equipamento",
                "nivel",
                "escaninho_num_no_nivel",
                "capacidade_l",
                "tipo_equipamento_final",
                "product_code",
            ],
            ["LJ1-R1-001-1A", "LJ1", 1, 1, "prateleira", 1, 1, 20, "prateleira", "Vazio"],
        ],
        "Base_Produtos": [
            ["product_code", "product_name", "grupo"],
            ["SKU2", "Produto 2", "alimento"],
        ],
    }
    fake_client = _FakeClient(values_by_sheet)

    monkeypatch.setattr(card175_snapshot, "GSheetsClient", lambda _sheet_id: fake_client)
    monkeypatch.setattr(card175_snapshot, "_set_card175_context", lambda payload: None)

    result = card175_snapshot.import_card175_rows(
        sheet_id="fake-sheet",
        rows=[
            {
                "galpao": "LJ1",
                "rua": "2",
                "posicao_pallete": "2",
                "escaninho_nivel": "1A",
                "cod_produto": "SKU2",
                "desc_produto": "Produto 2",
                "quantidade": 5,
            }
        ],
        source_name="metabase_card_175",
    )

    assert result["success"] is True
    assert result["virtual_rows_added"] == 1

    working_rows = values_by_sheet[card175_snapshot.WORKING_PLAN_SHEET]
    generated_rows = values_by_sheet[card175_snapshot.CARD175_PLAN_SHEET]
    working_locations = [row[0] for row in working_rows[1:]]
    generated_locations = [row[0] for row in generated_rows[1:]]

    assert "LJ1-R2-002-1A" in working_locations
    assert "LJ1-R2-002-1A" not in generated_locations


def test_import_card175_skips_products_not_in_mix(monkeypatch):
    values_by_sheet = {
        "Mapa_Final_Escaninhos": [
            [
                "location_id",
                "galpao_id",
                "rua_num",
                "equipamento_num",
                "tipo_equipamento",
                "nivel",
                "escaninho_num_no_nivel",
                "capacidade_l",
                "tipo_equipamento_final",
                "product_code",
            ],
            ["LJ1-R1-001-1A", "LJ1", 1, 1, "prateleira", 1, 1, 20, "prateleira", "Vazio"],
        ],
        "Base_Produtos": [
            ["product_code", "product_name", "grupo"],
            ["SKU1", "Produto 1", "alimento"],
        ],
    }
    fake_client = _FakeClient(values_by_sheet)

    monkeypatch.setattr(card175_snapshot, "GSheetsClient", lambda _sheet_id: fake_client)
    monkeypatch.setattr(card175_snapshot, "_set_card175_context", lambda payload: None)

    result = card175_snapshot.import_card175_rows(
        sheet_id="fake-sheet",
        rows=[
            {
                "galpao": "LJ1",
                "rua": "1",
                "posicao_pallete": "1",
                "escaninho_nivel": "1A",
                "cod_produto": "REMOVIDO",
                "desc_produto": "Produto removido do mix",
                "quantidade": 3,
            }
        ],
        source_name="metabase_card_175",
    )

    assert result["success"] is True
    assert result["skipped_not_in_mix"] == 1
    working_rows = values_by_sheet[card175_snapshot.WORKING_PLAN_SHEET]
    assert "REMOVIDO" not in [str(value) for row in working_rows for value in row]
