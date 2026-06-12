"""Testes para JobService (SQLite) e rota /health."""
from __future__ import annotations

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app import app
from backend.application.jobs.job_service import JobService

client = TestClient(app, raise_server_exceptions=False)


# ── /health ──────────────────────────────────────────────────────────────────


class TestHealthEndpoint:
    def test_returns_200(self):
        r = client.get("/health")
        assert r.status_code == 200

    def test_returns_status_ok(self):
        r = client.get("/health")
        assert r.json().get("status") == "ok"

    def test_response_is_json(self):
        r = client.get("/health")
        assert r.headers["content-type"].startswith("application/json")


# ── JobService ────────────────────────────────────────────────────────────────


@pytest.fixture()
def svc():
    with tempfile.TemporaryDirectory() as tmp:
        yield JobService(db_path=Path(tmp) / "test.db")


class TestJobServiceEnqueue:
    def test_returns_string_id(self, svc):
        job_id = svc.enqueue("etl")
        assert isinstance(job_id, str) and len(job_id) > 0

    def test_job_starts_as_pending(self, svc):
        job_id = svc.enqueue("etl")
        assert svc.get(job_id)["status"] == "pending"

    def test_stores_payload(self, svc):
        job_id = svc.enqueue("etl", payload={"loja": "pinheiros"})
        assert svc.get(job_id)["payload"] == {"loja": "pinheiros"}

    def test_empty_payload_stored_as_empty_dict(self, svc):
        job_id = svc.enqueue("etl")
        assert svc.get(job_id)["payload"] == {}

    def test_each_call_generates_unique_id(self, svc):
        ids = {svc.enqueue("etl") for _ in range(5)}
        assert len(ids) == 5


class TestJobServiceUpdate:
    def test_update_to_running(self, svc):
        job_id = svc.enqueue("etl")
        svc.update(job_id, "running")
        assert svc.get(job_id)["status"] == "running"

    def test_update_to_done_with_result(self, svc):
        job_id = svc.enqueue("etl")
        svc.update(job_id, "done", result={"rows": 42})
        job = svc.get(job_id)
        assert job["status"] == "done"
        assert job["result"] == {"rows": 42}

    def test_update_to_failed_with_error(self, svc):
        job_id = svc.enqueue("etl")
        svc.update(job_id, "failed", error="planilha não encontrada")
        job = svc.get(job_id)
        assert job["status"] == "failed"
        assert job["error"] == "planilha não encontrada"

    def test_update_nonexistent_job_does_not_raise(self, svc):
        svc.update("id-inexistente", "done")  # não deve lançar


class TestJobServiceGet:
    def test_get_unknown_job_returns_none(self, svc):
        assert svc.get("nao-existe") is None

    def test_get_returns_all_fields(self, svc):
        job_id = svc.enqueue("etl", payload={"x": 1})
        job = svc.get(job_id)
        for field in ("id", "type", "status", "payload", "created_at", "updated_at"):
            assert field in job

    def test_full_lifecycle(self, svc):
        job_id = svc.enqueue("etl")
        svc.update(job_id, "running")
        svc.update(job_id, "done", result={"ok": True})
        job = svc.get(job_id)
        assert job["status"] == "done"
        assert job["result"]["ok"] is True


# ── GET /api/jobs/{job_id} ────────────────────────────────────────────────────


class TestJobsRoute:
    def test_unknown_job_returns_404(self):
        r = client.get("/api/jobs/id-que-nao-existe")
        assert r.status_code == 404

    def test_existing_job_returns_200(self):
        with patch("backend.entrypoints.api.routes._job_service") as mock_svc:
            mock_svc.get.return_value = {
                "id": "abc", "type": "etl", "status": "done",
                "payload": {}, "result": None, "error": None,
                "created_at": "2026-01-01T00:00:00+00:00",
                "updated_at": "2026-01-01T00:00:00+00:00",
            }
            r = client.get("/api/jobs/abc")
        assert r.status_code == 200
        assert r.json()["status"] == "done"
