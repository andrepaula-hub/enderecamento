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

    def fake_fetch_rows_directly(*, data_inicial, data_final, stores, timeout_seconds):
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

    monkeypatch.setattr(metabase_sales, "_fetch_rows_directly", fake_fetch_rows_directly)
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


def test_fetch_card_823_rows_uses_direct_metabase_query(monkeypatch):
    captured: dict[str, object] = {}

    def fake_fetch_rows_directly(*, data_inicial, data_final, stores, timeout_seconds):
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

    monkeypatch.setattr(metabase_sales, "_fetch_rows_directly", fake_fetch_rows_directly)

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


def test_fetch_rows_compat_wrapper_uses_direct_metabase(monkeypatch):
    captured: dict[str, object] = {}

    def fake_fetch_rows_directly(*, data_inicial, data_final, stores, timeout_seconds):
        captured["data_inicial"] = data_inicial
        captured["data_final"] = data_final
        captured["stores"] = stores
        captured["timeout_seconds"] = timeout_seconds
        return {
            "rows": [{"cod_produto": "CT1", "_requested_store": "pamplona"}],
            "data_inicial_effective": data_inicial,
            "data_final_effective": data_final,
            "fallback_applied": False,
            "fallback_reason": "",
        }

    monkeypatch.setattr(metabase_sales, "_fetch_rows_directly", fake_fetch_rows_directly)

    result = metabase_sales._fetch_rows_via_apps_script(
        data_inicial="2026-03-01",
        data_final="2026-03-31",
        stores=["pamplona"],
        timeout_seconds=123,
    )

    assert captured["data_inicial"] == "2026-03-01"
    assert captured["data_final"] == "2026-03-31"
    assert captured["stores"] == ["pamplona"]
    assert captured["timeout_seconds"] == 123
    assert result["rows"] == [{"cod_produto": "CT1", "_requested_store": "pamplona"}]


def test_fetch_rows_directly_assigns_store_from_dark_store(monkeypatch):
    captured: dict[str, object] = {}

    def fake_resolve_metabase_session(timeout_seconds):
        captured["timeout_seconds"] = timeout_seconds
        return "session-123"

    def fake_query(*, base_url, card_id, session_id, parameters, timeout_seconds):
        captured["base_url"] = base_url
        captured["card_id"] = card_id
        captured["session_id"] = session_id
        captured["parameters"] = parameters
        return [{"cod_produto": "CT1", "dark_store": "Dark Store Vila Guilherme"}]

    monkeypatch.setattr(metabase_sales, "resolve_metabase_session", fake_resolve_metabase_session)
    monkeypatch.setattr(metabase_sales, "metabase_query_card_with_auth_retry", fake_query)

    result = metabase_sales._fetch_rows_directly(
        data_inicial="2026-06-01",
        data_final="2026-07-01",
        stores=["vilaGuilherme"],
        timeout_seconds=123,
    )

    assert captured["session_id"] == "session-123"
    assert captured["card_id"] == 823
    assert result["rows"][0]["_requested_store"] == "vilaGuilherme"


def test_fetch_store_options_discovers_stores_from_card_823(monkeypatch, tmp_path):
    cache_path = tmp_path / "stores.json"
    captured: dict[str, object] = {}

    def fake_resolve_metabase_session(timeout_seconds):
        captured["timeout_seconds"] = timeout_seconds
        return "session-123"

    def fake_query(*, base_url, card_id, session_id, parameters, timeout_seconds):
        captured["card_id"] = card_id
        captured["session_id"] = session_id
        captured["parameters"] = parameters
        return [
            {"dark_store": "Dark Store Vila Guilherme"},
            {"dark_store": "Dark Store Nova Loja"},
            {"dark_store": "Dark Store Nova Loja"},
        ]

    monkeypatch.setattr(metabase_sales, "METABASE_STORES_CACHE_PATH", cache_path)
    monkeypatch.setattr(metabase_sales, "resolve_metabase_session", fake_resolve_metabase_session)
    monkeypatch.setattr(metabase_sales, "metabase_query_card_with_auth_retry", fake_query)

    result = metabase_sales._fetch_store_options_from_metabase(timeout_seconds=45)

    assert captured["card_id"] == 823
    assert {"value": "vilaGuilherme", "label": "Vila Guilherme", "query_value": "Dark Store Vila Guilherme"} in result
    assert {"value": "novaLoja", "label": "Nova Loja", "query_value": "Dark Store Nova Loja"} in result
    assert cache_path.exists()


def test_normalize_store_ids_accepts_dynamically_discovered_store():
    available = [
        {"value": "pamplona", "label": "Jardins / Pamplona"},
        {"value": "vilaGuilherme", "label": "Vila Guilherme"},
    ]

    assert metabase_sales._normalize_store_ids(
        ["vilaGuilherme", "unknown", "pamplona"], available
    ) == ["vilaGuilherme", "pamplona"]
