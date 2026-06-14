"""
Testes para save_batch_moves, save_single_move e execute_swap (XLSX local).

Verifica que os dados mudam corretamente no arquivo após cada operação.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from openpyxl import Workbook, load_workbook

from core.moves import execute_swap, save_batch_moves, save_single_move


# ── fixtures ──────────────────────────────────────────────────────────────────

HEADERS = ["location_id", "product_code", "product_name", "tipo_equipamento"]


def _make_xlsx(path: Path, rows: list[list]) -> Path:
    wb = Workbook()
    ws = wb.active
    ws.title = "Plano_Enderecamento_Final"
    ws.append(HEADERS)
    for row in rows:
        ws.append(row)
    wb.save(path)
    return path


def _make_standard_xlsx(path: Path) -> Path:
    """
    R1E1-A1: SKU001 (Produto A) — prateleira
    R1E2-A1: vazio              — prateleira
    R1E3-A1: SKU002 (Produto B) — prateleira
    """
    return _make_xlsx(path, [
        ["R1E1-A1", "SKU001", "Produto A", "prateleira"],
        ["R1E2-A1", None, None, "prateleira"],
        ["R1E3-A1", "SKU002", "Produto B", "prateleira"],
    ])


def _read_codes(path: Path) -> dict[str, str | None]:
    """Retorna {location_id: product_code} para todas as linhas do plano."""
    wb = load_workbook(path)
    ws = wb["Plano_Enderecamento_Final"]
    headers = [c.value for c in ws[1]]
    loc_col = headers.index("location_id") + 1
    code_col = headers.index("product_code") + 1
    return {
        ws.cell(row=r, column=loc_col).value: ws.cell(row=r, column=code_col).value
        for r in range(2, ws.max_row + 1)
    }


def _move(code: str, from_loc: str, to_loc: str, name: str = "Produto") -> dict:
    return {
        "productCode": code,
        "productName": name,
        "productInfo": {"product_code": code, "product_name": name},
        "locAnteriorId": from_loc,
        "locNovoId": to_loc,
    }


# ── save_batch_moves ──────────────────────────────────────────────────────────

class TestSaveBatchMoves:
    def test_mover_produto_para_slot_vazio_retorna_success(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        r = save_batch_moves(xlsx, [_move("SKU001", "R1E1-A1", "R1E2-A1")])
        assert r["success"] is True

    def test_produto_aparece_no_destino_apos_mover(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        save_batch_moves(xlsx, [_move("SKU001", "R1E1-A1", "R1E2-A1")])
        codes = _read_codes(xlsx)
        assert codes["R1E2-A1"] == "SKU001"

    def test_origem_fica_vazia_apos_mover(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        save_batch_moves(xlsx, [_move("SKU001", "R1E1-A1", "R1E2-A1")])
        codes = _read_codes(xlsx)
        assert codes["R1E1-A1"] is None

    def test_alocar_produto_novo_de_unallocated(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        r = save_batch_moves(xlsx, [_move("SKU-NOVO", "UNALLOCATED", "R1E2-A1", "Produto Novo")])
        assert r["success"] is True
        assert _read_codes(xlsx)["R1E2-A1"] == "SKU-NOVO"

    def test_desalocar_produto_para_unallocated(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        r = save_batch_moves(xlsx, [_move("SKU001", "R1E1-A1", "UNALLOCATED")])
        assert r["success"] is True
        assert _read_codes(xlsx)["R1E1-A1"] is None

    def test_destino_inexistente_retorna_error(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        r = save_batch_moves(xlsx, [_move("SKU001", "R1E1-A1", "R9E9-Z9")])
        assert r["success"] is False
        assert "missingTargets" in r

    def test_destino_cheio_retorna_error(self, tmp_path):
        # R1E1-A1 já tem SKU001, adicionar segundo produto via dois moves
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        # primeiro preenche o slot vazio
        save_batch_moves(xlsx, [_move("SKU-X", "UNALLOCATED", "R1E1-A1")])
        # agora tenta colocar um terceiro
        r = save_batch_moves(xlsx, [_move("SKU-Y", "UNALLOCATED", "R1E1-A1")])
        assert r["success"] is False
        assert "fullTargets" in r

    def test_lista_vazia_retorna_success(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        r = save_batch_moves(xlsx, [])
        assert r["success"] is True

    def test_multiplos_moves_em_lote(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        moves = [
            _move("SKU001", "R1E1-A1", "R1E2-A1"),
            _move("SKU002", "R1E3-A1", "R1E1-A1"),
        ]
        r = save_batch_moves(xlsx, moves)
        assert r["success"] is True
        codes = _read_codes(xlsx)
        assert codes["R1E2-A1"] == "SKU001"
        assert codes["R1E1-A1"] == "SKU002"

    def test_aba_ausente_retorna_error(self, tmp_path):
        wb = Workbook()
        wb.active.title = "Outra_Aba"
        path = tmp_path / "plano.xlsx"
        wb.save(path)
        with pytest.raises(Exception):
            save_batch_moves(path, [_move("SKU001", "R1E1-A1", "R1E2-A1")])


# ── save_single_move ──────────────────────────────────────────────────────────

class TestSaveSingleMove:
    def test_mover_produto_unico_retorna_success(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        r = save_single_move(xlsx, _move("SKU001", "R1E1-A1", "R1E2-A1"))
        assert r["success"] is True

    def test_produto_chega_ao_destino(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        save_single_move(xlsx, _move("SKU001", "R1E1-A1", "R1E2-A1"))
        assert _read_codes(xlsx)["R1E2-A1"] == "SKU001"

    def test_e_equivalente_a_batch_com_um_move(self, tmp_path):
        xlsx1 = _make_standard_xlsx(tmp_path / "plano1.xlsx")
        xlsx2 = _make_standard_xlsx(tmp_path / "plano2.xlsx")
        move = _move("SKU001", "R1E1-A1", "R1E2-A1")
        r1 = save_single_move(xlsx1, move)
        r2 = save_batch_moves(xlsx2, [move])
        assert r1["success"] == r2["success"]
        assert _read_codes(xlsx1) == _read_codes(xlsx2)


# ── execute_swap ──────────────────────────────────────────────────────────────

class TestExecuteSwap:
    def _swap_info(self, loc_a: str, code_a: str, loc_b: str, code_b: str) -> dict:
        return {
            "moveA": {
                "locAnteriorId": loc_a,
                "productCode": code_a,
                "productInfo": {"product_code": code_a, "product_name": f"Prod {code_a}"},
            },
            "moveB": {
                "locAnteriorId": loc_b,
                "productCode": code_b,
                "productInfo": {"product_code": code_b, "product_name": f"Prod {code_b}"},
            },
        }

    def test_troca_retorna_success(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        swap = self._swap_info("R1E1-A1", "SKU001", "R1E3-A1", "SKU002")
        r = execute_swap(xlsx, swap)
        assert r["success"] is True

    def test_produtos_ficam_trocados(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        swap = self._swap_info("R1E1-A1", "SKU001", "R1E3-A1", "SKU002")
        execute_swap(xlsx, swap)
        codes = _read_codes(xlsx)
        assert codes["R1E1-A1"] == "SKU002"
        assert codes["R1E3-A1"] == "SKU001"

    def test_local_invalido_retorna_error(self, tmp_path):
        xlsx = _make_standard_xlsx(tmp_path / "plano.xlsx")
        swap = {"moveA": {"locAnteriorId": "", "productCode": "SKU001", "productInfo": {}},
                "moveB": {"locAnteriorId": "R1E3-A1", "productCode": "SKU002", "productInfo": {}}}
        r = execute_swap(xlsx, swap)
        assert r["success"] is False
