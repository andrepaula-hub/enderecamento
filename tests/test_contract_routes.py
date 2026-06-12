"""
Testes de contrato para as rotas críticas usadas pelo front.
Verificam a estrutura de response — não chamam Google Sheets nem Metabase.

Comportamento real do app:
- Se há planilha ativa OU arquivo XLSX local, a rota opera sobre eles.
- Sem nenhum dos dois, retorna erro.
Os testes com "no_sheet" usam monkeypatch para remover ambos os caminhos.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import app as app_module
from app import app

client = TestClient(app, raise_server_exceptions=False)

EMPTY_ARGS = {"args": []}


def _patch_no_sheet():
    """Contexto que remove planilha ativa e caminho XLSX local.

    get_active_sheet foi importado diretamente em app.py via
    `from core.gsheets_client import get_active_sheet`, então o patch
    deve ser aplicado no namespace de app, não no core.
    """
    return (
        patch.object(app_module, "DATA_XLSX_PATH", None),
        patch("app.get_active_sheet", return_value=None),
    )


# ── helpers ──────────────────────────────────────────────────────────────────

def _is_valid_response(data: dict) -> bool:
    """Todo response deve ter 'success' (bool) ou 'error' (str) na raiz."""
    return "success" in data or "error" in data


# ── /api/getWorkflowSheets ────────────────────────────────────────────────────

class TestGetWorkflowSheets:
    def test_returns_200(self):
        r = client.post("/api/getWorkflowSheets", json=EMPTY_ARGS)
        assert r.status_code == 200

    def test_response_has_success_field(self):
        r = client.post("/api/getWorkflowSheets", json=EMPTY_ARGS)
        data = r.json()
        assert "success" in data

    def test_response_has_target_field(self):
        r = client.post("/api/getWorkflowSheets", json=EMPTY_ARGS)
        data = r.json()
        assert "target" in data

    def test_target_is_dict_or_none(self):
        r = client.post("/api/getWorkflowSheets", json=EMPTY_ARGS)
        data = r.json()
        assert data["target"] is None or isinstance(data["target"], dict)

    def test_accepts_empty_body(self):
        r = client.post("/api/getWorkflowSheets")
        assert r.status_code == 200


# ── /api/getInitialData ───────────────────────────────────────────────────────

class TestGetInitialData:
    def test_returns_200(self):
        r = client.post("/api/getInitialData", json=EMPTY_ARGS)
        assert r.status_code == 200

    def test_without_active_sheet_returns_error_field(self):
        p1, p2 = _patch_no_sheet()
        with p1, p2:
            r = client.post("/api/getInitialData", json=EMPTY_ARGS)
            data = r.json()
            assert "error" in data or data.get("success") is False

    def test_error_message_is_string(self):
        r = client.post("/api/getInitialData", json=EMPTY_ARGS)
        data = r.json()
        if "error" in data:
            assert isinstance(data["error"], str)
            assert len(data["error"]) > 0

    def test_accepts_empty_body(self):
        r = client.post("/api/getInitialData")
        assert r.status_code == 200

    def test_response_is_json(self):
        r = client.post("/api/getInitialData", json=EMPTY_ARGS)
        assert r.headers["content-type"].startswith("application/json")


# ── /api/saveBatchMoves ───────────────────────────────────────────────────────

class TestSaveBatchMoves:
    def test_returns_200(self):
        r = client.post("/api/saveBatchMoves", json={"args": [[], {}]})
        assert r.status_code == 200

    def test_without_active_sheet_returns_success_false(self):
        p1, p2 = _patch_no_sheet()
        with p1, p2:
            r = client.post("/api/saveBatchMoves", json={"args": [[], {}]})
            assert r.json().get("success") is False

    def test_error_message_mentions_planilha(self):
        p1, p2 = _patch_no_sheet()
        with p1, p2:
            r = client.post("/api/saveBatchMoves", json={"args": [[], {}]})
            data = r.json()
            assert "planilha" in data.get("error", "").lower()

    def test_empty_moves_list_accepted(self):
        r = client.post("/api/saveBatchMoves", json={"args": [[]]})
        assert r.status_code == 200

    def test_move_with_valid_shape_accepted(self):
        move = {"from": "RUA-A-01-01", "to": "RUA-B-02-03", "product_id": "SKU001", "slot": 1}
        r = client.post("/api/saveBatchMoves", json={"args": [[move]]})
        assert r.status_code == 200

    def test_response_has_success_field(self):
        r = client.post("/api/saveBatchMoves", json={"args": [[]]})
        assert "success" in r.json()


# ── /api/savePlanoVersion ─────────────────────────────────────────────────────

class TestSavePlanoVersion:
    def test_returns_200(self):
        r = client.post("/api/savePlanoVersion", json={"args": ["test-version"]})
        assert r.status_code == 200

    def test_without_active_sheet_returns_success_false(self):
        p1, p2 = _patch_no_sheet()
        with p1, p2:
            r = client.post("/api/savePlanoVersion", json={"args": ["test-version"]})
            assert r.json().get("success") is False

    def test_response_has_success_field(self):
        r = client.post("/api/savePlanoVersion", json={"args": ["test-version"]})
        assert "success" in r.json()

    def test_accepts_empty_name(self):
        r = client.post("/api/savePlanoVersion", json={"args": [""]})
        assert r.status_code == 200


# ── /api/listPlanoVersions ────────────────────────────────────────────────────

class TestListPlanoVersions:
    def test_returns_200(self):
        r = client.post("/api/listPlanoVersions", json=EMPTY_ARGS)
        assert r.status_code == 200

    def test_has_success_field(self):
        r = client.post("/api/listPlanoVersions", json=EMPTY_ARGS)
        assert "success" in r.json()

    def test_accepts_empty_body(self):
        r = client.post("/api/listPlanoVersions")
        assert r.status_code == 200


# ── /api/restorePlanoVersion ──────────────────────────────────────────────────

class TestRestorePlanoVersion:
    def test_returns_200(self):
        r = client.post("/api/restorePlanoVersion", json={"args": ["v_fake_id"]})
        assert r.status_code == 200

    def test_without_active_sheet_returns_success_false(self):
        r = client.post("/api/restorePlanoVersion", json={"args": ["v_fake_id"]})
        data = r.json()
        assert data.get("success") is False

    def test_response_has_success_field(self):
        r = client.post("/api/restorePlanoVersion", json={"args": ["v_fake_id"]})
        assert "success" in r.json()


# ── /api/getMapLoadStatus ─────────────────────────────────────────────────────

class TestGetMapLoadStatus:
    def test_returns_200(self):
        r = client.post("/api/getMapLoadStatus", json=EMPTY_ARGS)
        assert r.status_code == 200

    def test_without_active_sheet_returns_success_false(self):
        p1, p2 = _patch_no_sheet()
        with p1, p2:
            r = client.post("/api/getMapLoadStatus", json=EMPTY_ARGS)
            assert r.json().get("success") is False

    def test_has_success_field(self):
        r = client.post("/api/getMapLoadStatus", json=EMPTY_ARGS)
        assert "success" in r.json()


# ── /api/{func_name} catch-all ────────────────────────────────────────────────

class TestNotImplementedCatchAll:
    def test_unknown_route_returns_200(self):
        r = client.post("/api/rotaNaoExiste", json=EMPTY_ARGS)
        assert r.status_code == 200

    def test_unknown_route_returns_success_false(self):
        r = client.post("/api/rotaNaoExiste", json=EMPTY_ARGS)
        assert r.json().get("success") is False

    def test_unknown_route_error_mentions_function_name(self):
        r = client.post("/api/rotaNaoExiste", json=EMPTY_ARGS)
        assert "rotaNaoExiste" in r.json().get("error", "")
