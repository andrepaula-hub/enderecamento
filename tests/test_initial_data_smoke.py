from pathlib import Path

import pytest

from core.initial_data import _build_card175_mode_rows, get_initial_data


def test_card788_mode_keeps_alphanumeric_special_streets():
    rows = [
        {
            "location_id": "LJ060001-RA-001-1A",
            "rua_num": "A",
            "equipamento_num": 1,
            "product_code": "SKU-A",
        },
        {
            "location_id": "LJ060001-RGE04-001-1A",
            "rua_num": "GE04",
            "equipamento_num": 1,
            "product_code": "SKU-GE",
        },
        {
            "location_id": "LJ060001-RDEVOL-001-1A",
            "rua_num": "DEVOL",
            "equipamento_num": 1,
            "product_code": "SKU-D",
        },
    ]

    result = _build_card175_mode_rows(rows, [], [])

    assert {row["product_code"] for row in result} == {"SKU-A", "SKU-GE", "SKU-D"}
    assert all(row["card175_only_in_plan"] for row in result)


def test_get_initial_data_smoke():
    path = Path(__file__).resolve().parents[1] / "ETL" / "ENDERECAMENTO_DARK_PINHEIROS (teste) (2).xlsx"
    if not path.exists():
        pytest.skip("Planilha base não encontrada")
    data = get_initial_data(path)
    required_keys = {
        "content_html",
        "failed_products_section",
        "all_products_json",
        "product_location_map_json",
        "unallocated_products_json",
        "all_products_data_map_json",
        "equipTypesJson",
        "metrics_panel_data_json",
        "barcode_map_json",
        "spreadsheet_title",
        "limite_peso_kg",
    }
    assert required_keys.issubset(data.keys())
    assert data["content_html"]
