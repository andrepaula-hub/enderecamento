from __future__ import annotations

from copy import deepcopy
from typing import Any

import core.gsheets_backend as gb


class _FakeGSheetsClient:
    def __init__(self, sheets: dict[str, list[list[Any]]]):
        self.sheets = deepcopy(sheets)

    def read_values(self, name: str) -> list[list[Any]]:
        return deepcopy(self.sheets.get(name, []))

    def delete_rows(self, name: str, row_indices: list[int]) -> None:
        rows = self.sheets[name]
        for row_num in sorted(set(row_indices), reverse=True):
            del rows[row_num - 1]

    def append_rows(self, name: str, rows: list[list[Any]]) -> None:
        self.sheets.setdefault(name, []).extend(deepcopy(rows))

    def update_rows(self, name: str, row_updates: dict[int, list[Any]], header_len: int) -> None:
        rows = self.sheets[name]
        for row_num, values in row_updates.items():
            padded = values + [None] * (header_len - len(values))
            rows[row_num - 1] = padded[:header_len]

    def ensure_sheet(self, name: str) -> None:
        self.sheets.setdefault(name, [])


def _base_sheets() -> dict[str, list[list[Any]]]:
    return {
        gb.SHEET_VOLUMETRIA: [
            [
                "tipo_equipamento",
                "qtd_niveis",
                "qtd_escaninhos_por_nivel",
                "l_por_escaninho",
                "fator_seguranca",
                "niveis_hot_zone",
                "nivel_alto",
                "nivel_inferior",
            ],
            ["prateleira", 5, 7, 10, 1, "B", "A", "E"],
            ["geladeira", 5, 5, 2.5, 1.2, "C", "A", "E"],
        ],
        gb.SHEET_PLANO_FINAL: [
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
                "is_hot_zone",
                "is_nivel_alto",
                "is_nivel_inferior",
            ],
            ["LJ-R1-023-5A", "LJ", 1, 23, "prateleira", "A", 1, 10, "prateleira", "SKU1", "Produto 1", False, True, False],
            ["LJ-R1-023-5B", "LJ", 1, 23, "prateleira", "A", 2, 10, "prateleira", "SKU2", "Produto 2", False, True, False],
            ["LJ-R1-022-5A", "LJ", 1, 22, "prateleira", "A", 1, 10, "prateleira", "SKU3", "Produto 3", False, True, False],
        ],
        gb.SHEET_CADASTRO_NOVO: [
            ["galpao_id", "rua_num", "equipamento_num", "tipo_equipamento", "Quant. Equip"],
            ["LJ", 1, 23, "prateleira", 1],
            ["LJ", 1, 22, "prateleira", 1],
        ],
    }


def test_change_equipment_type_confirms_plano_and_cadastro(monkeypatch):
    fake = _FakeGSheetsClient(_base_sheets())
    monkeypatch.setattr(gb, "GSheetsClient", lambda _sheet_id: fake)
    monkeypatch.setattr(gb.time, "sleep", lambda _seconds: None)

    result = gb.change_equipment_type_gsheet("sheet", "R1-023", "geladeira", True)

    assert result["success"] is True
    plano = fake.read_values(gb.SHEET_PLANO_FINAL)
    headers = plano[0]
    idx = {header: pos for pos, header in enumerate(headers)}
    rows = [row for row in plano[1:] if row[idx["rua_num"]] == 1 and row[idx["equipamento_num"]] == 23]
    assert len(rows) == 25
    assert {row[idx["tipo_equipamento"]] for row in rows} == {"geladeira"}
    assert {row[idx["tipo_equipamento_final"]] for row in rows} == {"geladeira"}
    assert {row[idx["capacidade_l"]] for row in rows} == {3.0}
    assert {row[idx["product_code"]] for row in rows} == {"Vazio"}

    cadastro = fake.read_values(gb.SHEET_CADASTRO_NOVO)
    assert cadastro[1][3] == "geladeira"


def test_change_equipment_type_fails_before_mutating_when_cadastro_missing(monkeypatch):
    sheets = _base_sheets()
    sheets[gb.SHEET_CADASTRO_NOVO] = [["galpao_id", "rua_num", "equipamento_num", "tipo_equipamento"]]
    fake = _FakeGSheetsClient(sheets)
    before = fake.read_values(gb.SHEET_PLANO_FINAL)
    monkeypatch.setattr(gb, "GSheetsClient", lambda _sheet_id: fake)

    result = gb.change_equipment_type_gsheet("sheet", "R1-023", "geladeira", True)

    assert result["success"] is False
    assert "Cadastro_Equipamentos" in result["error"]
    assert fake.read_values(gb.SHEET_PLANO_FINAL) == before
