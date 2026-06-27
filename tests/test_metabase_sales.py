from __future__ import annotations

from pathlib import Path

from core import metabase_sales


def test_aggregate_sales_rows_merges_multiple_stores():
    rows = [
        {"cod_produto": "CT1", "nome": "Produto 1", "total_vendido": "2"},
        {"cod_produto": "CT1", "nome": "Produto 1", "total_vendido": "3"},
        {"cod_produto": "CT2", "nome": "Produto 2", "total_vendido": 1},
        {"cod_produto": "CT2", "nome": "Produto 2", "total_vendido": "1,5"},
    ]

    result = metabase_sales.aggregate_sales_rows(rows)

    assert result == [
        {"cod_produto": "CT1", "desc_produto": "Produto 1", "qtd_total": 5},
        {"cod_produto": "CT2", "desc_produto": "Produto 2", "qtd_total": 2.5},
    ]


def test_validate_sales_rows_flags_outside_period_and_store_mismatch():
    rows = [
        {"data_entrega": "2026-03-05", "dark_store": "Dark Store Jardins / Pamplona"},
        {"data_entrega": "2026-04-02", "dark_store": "Dark Store Moema"},
    ]

    result = metabase_sales.validate_sales_rows(rows, "pamplona", "2026-03-01", "2026-03-31")

    assert result["raw_rows"] == 2
    assert result["outside_period_count"] == 1
    assert result["store_mismatch_count"] == 1
    assert len(result["warnings"]) == 2


def test_build_vendas_alvo_from_metabase_aggregates_and_writes(monkeypatch):
    written_payload: dict[str, object] = {}

    def fake_fetch_rows_via_apps_script(*, data_inicial, data_final, stores, timeout_seconds):
        assert data_inicial == "2026-03-01"
        assert data_final == "2026-03-31"
        assert stores == ["pamplona", "moema"]
        return {
            "rows": [
                {"cod_produto": "CT1", "nome": "Produto 1", "total_vendido": 2, "dark_store": "Pamplona", "_requested_store": "pamplona"},
                {"cod_produto": "CT1", "nome": "Produto 1", "total_vendido": 5, "dark_store": "Moema", "_requested_store": "moema"},
                {"cod_produto": "CT2", "nome": "Produto 2", "total_vendido": 1, "dark_store": "Moema", "_requested_store": "moema"},
            ],
            "data_inicial_effective": "2026-03-01",
            "data_final_effective": "2026-03-31",
            "fallback_applied": False,
            "fallback_reason": "",
        }

    def fake_write_vendas_alvo_sheet(master_sheet_id: str, rows):
        written_payload["master_sheet_id"] = master_sheet_id
        written_payload["rows"] = rows
        return {
            "sheet_name": "Vendas Alvo",
            "sheet_url": "https://docs.google.com/spreadsheets/d/fake/edit#gid=123",
            "rows_written": len(rows),
        }

    monkeypatch.setattr(metabase_sales, "_fetch_rows_via_apps_script", fake_fetch_rows_via_apps_script)
    monkeypatch.setattr(metabase_sales, "write_vendas_alvo_sheet", fake_write_vendas_alvo_sheet)
    monkeypatch.setattr(metabase_sales, "save_metabase_sales_context", lambda **kwargs: kwargs)

    result = metabase_sales.build_vendas_alvo_from_metabase(
        master_sheet_id="sheet-123",
        data_inicial="2026-03-01",
        data_final="2026-03-31",
        stores=["pamplona", "moema"],
    )

    assert written_payload["master_sheet_id"] == "sheet-123"
    assert written_payload["rows"] == [
        {"cod_produto": "CT1", "desc_produto": "Produto 1", "qtd_total": 7},
        {"cod_produto": "CT2", "desc_produto": "Produto 2", "qtd_total": 1},
    ]
    assert result["rows_fetched_raw"] == 3
    assert result["rows_written"] == 2


def test_resolve_store_value_accepts_code_mapping():
    assert metabase_sales.resolve_store_value(cod_loja="LJ060001") == "pamplona"


def test_write_metabase_rows_to_xlsx_writes_marker_when_empty(tmp_path: Path):
    output = tmp_path / "vendas.xlsx"

    saved_path = metabase_sales.write_metabase_rows_to_xlsx([], output)

    assert saved_path == output.resolve()


def test_fetch_card_823_rows_uses_card_api(monkeypatch):
    captured: dict[str, object] = {}

    def fake_fetch_rows_via_apps_script(*, data_inicial, data_final, stores, timeout_seconds):
        captured["data_inicial"] = data_inicial
        captured["data_final"] = data_final
        captured["stores"] = stores
        captured["timeout_seconds"] = timeout_seconds
        return {
            "rows": [{"cod_produto": "CT1"}],
            "data_inicial_effective": data_inicial,
            "data_final_effective": data_final,
            "fallback_applied": False,
            "fallback_reason": "",
        }

    monkeypatch.setattr(metabase_sales, "_fetch_rows_via_apps_script", fake_fetch_rows_via_apps_script)

    store, rows = metabase_sales.fetch_card_823_rows(
        data_inicial="2026-04-01",
        data_final="2026-04-30",
        cod_loja="LJ060001",
    )

    assert store == "pamplona"
    assert rows == [{"cod_produto": "CT1"}]
    assert captured["data_inicial"] == "2026-04-01"
    assert captured["data_final"] == "2026-04-30"
    assert captured["stores"] == ["pamplona"]


def test_metabase_query_card_with_auth_retry_refreshes_expired_session(monkeypatch):
    calls: list[str] = []

    def fake_query_card(*, session_id, **kwargs):
        calls.append(session_id)
        if session_id == "expired":
            raise RuntimeError("Erro ao consultar card 823: status=401 body=Unauthenticated")
        return [{"cod_produto": "CT1"}]

    monkeypatch.setattr(metabase_sales, "metabase_query_card", fake_query_card)
    monkeypatch.setattr(metabase_sales, "_resolve_fresh_metabase_session", lambda timeout_seconds: "fresh")

    result = metabase_sales.metabase_query_card_with_auth_retry(
        base_url="https://metabase.kdabra.com.br",
        card_id=823,
        session_id="expired",
        parameters=[],
    )

    assert result == [{"cod_produto": "CT1"}]
    assert calls == ["expired", "fresh"]


def test_fetch_rows_via_apps_script_uses_metabase_proxy(monkeypatch):
    captured: dict[str, object] = {}

    def fake_call(action, payload, *, timeout_seconds):
        captured["action"] = action
        captured["payload"] = payload
        captured["timeout_seconds"] = timeout_seconds
        return {
            "rows": [{"cod_produto": "CT1", "store_code": "pamplona"}],
            "data_inicial": "2026-03-01",
            "data_final": "2026-03-31",
            "errors": [],
        }

    monkeypatch.setattr(metabase_sales, "call_apps_script_webapp_action", fake_call)

    result = metabase_sales._fetch_rows_via_apps_script(
        data_inicial="2026-03-01",
        data_final="2026-03-31",
        stores=["pamplona"],
        timeout_seconds=123,
    )

    assert captured["action"] == "fetchVendasPorDiaRows"
    assert captured["payload"] == {
        "data_inicial": "2026-03-01",
        "data_final": "2026-03-31",
        "stores": ["pamplona"],
    }
    assert result["source"] == "apps_script_metabase_api"
    assert result["rows"] == [{"cod_produto": "CT1", "store_code": "pamplona", "_requested_store": "pamplona"}]
