from core import gsheets_backend
from core.initial_data import _build_dashboard_data, _build_unallocated_section, _enrich_base_map_with_plano_rows


class _FakeClient:
    def __init__(self, values):
        self.values = values
        self.updated_rows = None
        self.appended_rows = None
        self.updated_header = None
        self.ensured = []

    def ensure_sheet(self, sheet_name):
        self.ensured.append(sheet_name)

    def read_values(self, sheet_name):
        if sheet_name == gsheets_backend.SHEET_PLANO_FINAL:
            return self.values
        if sheet_name == gsheets_backend.SHEET_LOG_REEND:
            return []
        raise AssertionError(sheet_name)

    def update_rows(self, sheet_name, updates, width):
        self.updated_rows = (sheet_name, updates, width)

    def append_rows(self, sheet_name, rows):
        if sheet_name == gsheets_backend.SHEET_LOG_REEND:
            return
        self.appended_rows = (sheet_name, rows)

    def update_header(self, sheet_name, headers):
        self.updated_header = (sheet_name, headers)


def test_dashboard_data_exposes_slot_instance_ids():
    plano_data = [
        {"location_id": "LJ-R1-001-1A", "product_code": "SKU1"},
        {"location_id": "LJ-R1-001-1A", "product_code": "SKU2"},
    ]
    base_produtos_map = {
        "SKU1": {"product_name": "Produto 1", "grupo": "alimento"},
        "SKU2": {"product_name": "Produto 2", "grupo": "perfumaria"},
    }

    dashboard = _build_dashboard_data(plano_data, base_produtos_map)

    assert dashboard[0]["slot1_instance_id"] == "plano::LJ-R1-001-1A::1::SKU1"
    assert dashboard[0]["slot2_instance_id"] == "plano::LJ-R1-001-1A::2::SKU2"


def test_unallocated_products_get_stable_instance_ids():
    base_produtos_map = {
        "SKU1": {
            "product_code": "SKU1",
            "product_name": "Produto 1",
            "grupo": "alimento",
            "escaninhos_necessarios": 2,
        }
    }
    _, unallocated = _build_unallocated_section(
        base_produtos_map=base_produtos_map,
        base_produtos_data=[base_produtos_map["SKU1"]],
        plano_data=[],
        log_falhas_data=[],
        metrics={},
    )

    assert [item["instance_id"] for item in unallocated] == [
        "unallocated::SKU1::1",
        "unallocated::SKU1::2",
    ]


def test_save_batch_moves_requires_exact_source_row(monkeypatch):
    values = [
        ["location_id", "product_code", "product_name"],
        ["LJ-R1-001-1A", "SKU_OK", "Produto ok"],
        ["LJ-R1-001-1A", "SKU_OUTRO", "Produto outro"],
        ["LJ-R1-002-1A", "Vazio", ""],
    ]
    fake = _FakeClient(values)
    monkeypatch.setattr(gsheets_backend, "GSheetsClient", lambda sheet_id: fake)
    monkeypatch.setattr(gsheets_backend, "_get_log_datetime", lambda: ("2026-04-20", "10:00:00"))

    result = gsheets_backend.save_batch_moves_gsheet(
        "sheet-id",
        [
            {
                "productCode": "SKU_INEXISTENTE",
                "locAnteriorId": "bin-LJ-R1-001-1A",
                "locNovoId": "bin-LJ-R1-002-1A",
                "productInfo": {"product_code": "SKU_INEXISTENTE", "product_name": "Fantasma"},
            }
        ],
    )

    assert result["success"] is False
    assert "missingSources" in result
    assert result["missingSources"] == ["LJ-R1-001-1A:SKU_INEXISTENTE"]
    assert fake.updated_rows is None
    assert fake.appended_rows is None


def test_dashboard_ignores_plan_sku_absent_from_base_map():
    plano_data = [
        {"location_id": "LJ-R1-001-1A", "product_code": "SKU_ZERO", "product_name": "Produto zerado"},
        {"location_id": "LJ-R1-001-1A", "product_code": "Vazio"},
    ]
    dashboard = _build_dashboard_data(plano_data, {})
    assert dashboard[0]["product_code"] == "Vazio"
    assert dashboard[0]["slot_count"] == 0


def test_enrich_base_map_with_plano_rows_does_not_resurrect_missing_sku():
    base_produtos_map = {
        "SKU_OK": {
            "product_code": "SKU_OK",
            "product_name": "Produto ok",
            "quantidade": 3,
        }
    }
    plano_data = [
        {"location_id": "LJ-R1-001-1A", "product_code": "SKU_ZERO", "product_name": "Produto zerado", "quantidade": 9},
    ]
    enriched = _enrich_base_map_with_plano_rows(base_produtos_map, plano_data)
    assert "SKU_ZERO" not in enriched


def test_save_batch_moves_allows_multiple_products_from_same_origin(monkeypatch):
    values = [
        ["location_id", "product_code", "product_name"],
        ["LJ-R1-001-1A", "SKU1", "Produto 1"],
        ["LJ-R1-001-1A", "SKU2", "Produto 2"],
        ["LJ-R1-002-1A", "Vazio", ""],
        ["LJ-R1-002-1A", "Vazio", ""],
    ]
    fake = _FakeClient(values)
    monkeypatch.setattr(gsheets_backend, "GSheetsClient", lambda sheet_id: fake)
    monkeypatch.setattr(gsheets_backend, "_get_log_datetime", lambda: ("2026-04-24", "10:00:00"))

    result = gsheets_backend.save_batch_moves_gsheet(
        "sheet-id",
        [
            {
                "productCode": "SKU1",
                "locAnteriorId": "bin-LJ-R1-001-1A",
                "locNovoId": "bin-LJ-R1-002-1A",
                "productInfo": {"product_code": "SKU1", "product_name": "Produto 1"},
            },
            {
                "productCode": "SKU2",
                "locAnteriorId": "bin-LJ-R1-001-1A",
                "locNovoId": "bin-LJ-R1-002-1A",
                "productInfo": {"product_code": "SKU2", "product_name": "Produto 2"},
            },
        ],
    )

    assert result["success"] is True
    assert fake.updated_rows is not None
    updates = fake.updated_rows[1]
    moved_codes = {row[1] for row in updates.values() if len(row) > 1 and row[1] not in ("Vazio", None, "")}
    assert moved_codes == {"SKU1", "SKU2"}
