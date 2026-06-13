"""
Testes E2E de API para rotas que dependem de Google Sheets.

Estratégia: o app FastAPI roda inteiro via TestClient.
Mockamos apenas duas coisas:
  1. get_active_sheet → retorna uma planilha falsa (evita credenciais)
  2. A função específica do gsheets_backend → retorna dados controlados

Assim testamos que: a rota parseia os args corretamente, passa os
parâmetros certos para o backend, e serializa o response como esperado.
"""
from __future__ import annotations

from unittest.mock import MagicMock, call, patch

import pytest
from fastapi.testclient import TestClient

import app as app_module
from app import app

client = TestClient(app, raise_server_exceptions=False)

FAKE_SHEET = {"sheet_id": "fake-id-123", "title": "Planilha Teste"}
OK = {"success": True}
FAIL = {"success": False, "error": "erro simulado"}


def _sheet():
    """Contexto que injeta planilha ativa sem credenciais reais."""
    return patch("app.get_active_sheet", return_value=FAKE_SHEET)


def _no_sheet():
    """Contexto sem planilha ativa e sem XLSX local."""
    return (
        patch("app.get_active_sheet", return_value=None),
        patch.object(app_module, "DATA_XLSX_PATH", None),
    )


# ── /api/saveBatchMoves ───────────────────────────────────────────────────────

class TestSaveBatchMovesComSheet:
    def test_retorna_success_quando_gsheets_ok(self):
        with _sheet(), patch("app.save_batch_moves_gsheet", return_value={**OK, "saved": 2}):
            r = client.post("/api/saveBatchMoves", json={"args": [[{"locationId": "R1E1-A1"}]]})
        assert r.json()["success"] is True

    def test_repassa_lista_de_moves_corretamente(self):
        moves = [{"locationId": "R1E1-A1", "productCode": "SKU001"}]
        with _sheet(), patch("app.save_batch_moves_gsheet", return_value=OK) as mock_fn:
            client.post("/api/saveBatchMoves", json={"args": [moves]})
        assert mock_fn.call_args[0][1] == moves

    def test_opcao_skip_full_repassada_como_true(self):
        with _sheet(), patch("app.save_batch_moves_gsheet", return_value=OK) as mock_fn:
            client.post("/api/saveBatchMoves", json={"args": [[], {"skipFull": True}]})
        assert mock_fn.call_args[1].get("skip_full") is True

    def test_opcao_skip_full_false_por_padrao(self):
        with _sheet(), patch("app.save_batch_moves_gsheet", return_value=OK) as mock_fn:
            client.post("/api/saveBatchMoves", json={"args": [[]]})
        assert mock_fn.call_args[1].get("skip_full") is False

    def test_sem_sheet_retorna_success_false(self):
        p1, p2 = _no_sheet()
        with p1, p2:
            r = client.post("/api/saveBatchMoves", json={"args": [[]]})
        assert r.json()["success"] is False

    def test_response_e_json_valido(self):
        with _sheet(), patch("app.save_batch_moves_gsheet", return_value=OK):
            r = client.post("/api/saveBatchMoves", json={"args": [[]]})
        assert r.status_code == 200
        assert "success" in r.json()


# ── /api/saveSingleMove ───────────────────────────────────────────────────────

class TestSaveSingleMoveComSheet:
    def test_retorna_success_quando_gsheets_ok(self):
        move = {"locationId": "R1E1-A1", "productCode": "SKU001"}
        with _sheet(), \
             patch("app.save_single_move_gsheet", return_value=OK), \
             patch("app.append_card175_change_logs", return_value={"logged": 0}):
            r = client.post("/api/saveSingleMove", json={"args": [move]})
        assert r.json()["success"] is True

    def test_repassa_move_corretamente(self):
        move = {"locationId": "R1E2-A1", "productCode": "SKU002"}
        with _sheet(), \
             patch("app.save_single_move_gsheet", return_value=OK) as mock_fn, \
             patch("app.append_card175_change_logs", return_value={}):
            client.post("/api/saveSingleMove", json={"args": [move]})
        assert mock_fn.call_args[0][1] == move

    def test_sem_sheet_retorna_success_false(self):
        p1, p2 = _no_sheet()
        with p1, p2:
            r = client.post("/api/saveSingleMove", json={"args": [{}]})
        assert r.json()["success"] is False


# ── /api/executeSwap ──────────────────────────────────────────────────────────

class TestExecuteSwapComSheet:
    def test_retorna_success_quando_gsheets_ok(self):
        swap = {"moveA": {"locationId": "R1E1-A1"}, "moveB": {"locationId": "R1E2-A1"}}
        with _sheet(), \
             patch("app.execute_swap_gsheet", return_value=OK), \
             patch("app.append_card175_change_logs", return_value={}):
            r = client.post("/api/executeSwap", json={"args": [swap]})
        assert r.json()["success"] is True

    def test_repassa_swap_info_corretamente(self):
        swap = {"moveA": {"locationId": "R1E1-A1"}, "moveB": {"locationId": "R1E2-A1"}}
        with _sheet(), \
             patch("app.execute_swap_gsheet", return_value=OK) as mock_fn, \
             patch("app.append_card175_change_logs", return_value={}):
            client.post("/api/executeSwap", json={"args": [swap]})
        assert mock_fn.call_args[0][1] == swap

    def test_sem_sheet_retorna_success_false(self):
        p1, p2 = _no_sheet()
        with p1, p2:
            r = client.post("/api/executeSwap", json={"args": [{}]})
        assert r.json()["success"] is False


# ── /api/createNewEquipment ───────────────────────────────────────────────────

class TestCreateEquipmentComSheet:
    def test_retorna_success_quando_gsheets_ok(self):
        with _sheet(), \
             patch("app.get_workflow_sheet", return_value=None), \
             patch("app.create_new_equipment_gsheet", return_value={**OK, "equipment_id": "R5E3"}):
            r = client.post("/api/createNewEquipment", json={"args": [5, 3, "prateleira", "tester"]})
        assert r.json()["success"] is True

    def test_repassa_rua_equip_e_tipo_corretos(self):
        with _sheet(), \
             patch("app.get_workflow_sheet", return_value=None), \
             patch("app.create_new_equipment_gsheet", return_value=OK) as mock_fn:
            client.post("/api/createNewEquipment", json={"args": [5, 3, "prateleira", "tester"]})
        pos_args = mock_fn.call_args[0]
        assert pos_args[1] == 5          # rua_num
        assert pos_args[2] == 3          # equip_num
        assert pos_args[3] == "prateleira"

    def test_user_e_repassado(self):
        with _sheet(), \
             patch("app.get_workflow_sheet", return_value=None), \
             patch("app.create_new_equipment_gsheet", return_value=OK) as mock_fn:
            client.post("/api/createNewEquipment", json={"args": [1, 1, "freezer", "andre"]})
        assert mock_fn.call_args[1].get("user") == "andre"

    def test_sem_sheet_retorna_success_false(self):
        p1, p2 = _no_sheet()
        with p1, p2:
            r = client.post("/api/createNewEquipment", json={"args": [1, 1, "prateleira"]})
        assert r.json()["success"] is False


# ── /api/deleteEquipmentAndProducts ──────────────────────────────────────────

class TestDeleteEquipmentComSheet:
    def test_retorna_success_quando_gsheets_ok(self):
        with _sheet(), \
             patch("app.delete_equipment_and_products_gsheet", return_value={**OK, "deleted": 3}):
            r = client.post("/api/deleteEquipmentAndProducts", json={"args": ["R1E1", "tester"]})
        assert r.json()["success"] is True

    def test_repassa_equip_id_correto(self):
        with _sheet(), \
             patch("app.delete_equipment_and_products_gsheet", return_value=OK) as mock_fn:
            client.post("/api/deleteEquipmentAndProducts", json={"args": ["R2E5", "tester"]})
        assert mock_fn.call_args[0][1] == "R2E5"

    def test_sem_sheet_retorna_success_false(self):
        p1, p2 = _no_sheet()
        with p1, p2:
            r = client.post("/api/deleteEquipmentAndProducts", json={"args": ["R1E1"]})
        assert r.json()["success"] is False


# ── /api/changeEquipmentType ──────────────────────────────────────────────────

class TestChangeEquipmentTypeComSheet:
    def test_retorna_success_quando_gsheets_ok(self):
        with _sheet(), \
             patch("app.get_workflow_sheet", return_value=None), \
             patch("app.change_equipment_type_gsheet", return_value=OK):
            r = client.post("/api/changeEquipmentType", json={"args": ["R1E1", "geladeira", False]})
        assert r.json()["success"] is True

    def test_repassa_equip_id_e_tipo(self):
        with _sheet(), \
             patch("app.get_workflow_sheet", return_value=None), \
             patch("app.change_equipment_type_gsheet", return_value=OK) as mock_fn:
            client.post("/api/changeEquipmentType", json={"args": ["R1E1", "geladeira", False]})
        pos = mock_fn.call_args[0]
        assert pos[1] == "R1E1"
        assert pos[2] == "geladeira"

    def test_recolher_true_repassado(self):
        with _sheet(), \
             patch("app.get_workflow_sheet", return_value=None), \
             patch("app.change_equipment_type_gsheet", return_value=OK) as mock_fn:
            client.post("/api/changeEquipmentType", json={"args": ["R1E1", "prateleira", True]})
        assert mock_fn.call_args[0][3] is True

    def test_recolher_false_por_padrao(self):
        with _sheet(), \
             patch("app.get_workflow_sheet", return_value=None), \
             patch("app.change_equipment_type_gsheet", return_value=OK) as mock_fn:
            # sem terceiro arg → recolher = False
            client.post("/api/changeEquipmentType", json={"args": ["R1E1", "geladeira"]})
        assert mock_fn.call_args[0][3] is False

    def test_sem_sheet_retorna_success_false(self):
        p1, p2 = _no_sheet()
        with p1, p2:
            r = client.post("/api/changeEquipmentType", json={"args": ["R1E1", "geladeira"]})
        assert r.json()["success"] is False


# ── /api/addNewProduct ────────────────────────────────────────────────────────

class TestAddNewProductComSheet:
    def test_retorna_success_quando_gsheets_ok(self):
        product = {"product_code": "SKU-NOVO", "product_name": "Produto Novo"}
        with _sheet(), patch("app.add_new_product_gsheet", return_value={**OK, "added": 1}):
            r = client.post("/api/addNewProduct", json={"args": [product]})
        assert r.json()["success"] is True

    def test_repassa_produto_correto(self):
        product = {"product_code": "SKU-NOVO", "product_name": "Produto Novo"}
        with _sheet(), patch("app.add_new_product_gsheet", return_value=OK) as mock_fn:
            client.post("/api/addNewProduct", json={"args": [product]})
        assert mock_fn.call_args[0][1] == product

    def test_sem_sheet_retorna_success_false(self):
        p1, p2 = _no_sheet()
        with p1, p2:
            r = client.post("/api/addNewProduct", json={"args": [{}]})
        assert r.json()["success"] is False


# ── /api/updateBaseProduct ────────────────────────────────────────────────────

class TestUpdateBaseProductComSheet:
    def test_retorna_success_quando_gsheets_ok(self):
        product = {"product_code": "SKU001", "product_name": "Produto Atualizado"}
        with _sheet(), patch("app.update_base_product_gsheet", return_value={**OK, "updated": 1}):
            r = client.post("/api/updateBaseProduct", json={"args": ["SKU001", product]})
        assert r.json()["success"] is True

    def test_repassa_codigo_original_e_produto(self):
        product = {"product_code": "SKU001", "product_name": "Novo Nome"}
        with _sheet(), patch("app.update_base_product_gsheet", return_value=OK) as mock_fn:
            client.post("/api/updateBaseProduct", json={"args": ["SKU001", product]})
        pos = mock_fn.call_args[0]
        assert pos[1] == "SKU001"   # original_code
        assert pos[2] == product

    def test_sem_sheet_retorna_success_false(self):
        p1, p2 = _no_sheet()
        with p1, p2:
            r = client.post("/api/updateBaseProduct", json={"args": ["SKU001", {}]})
        assert r.json()["success"] is False
