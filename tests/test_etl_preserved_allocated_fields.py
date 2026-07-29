import core.enrichment_pipeline as enrichment_pipeline


def test_preserved_allocated_row_refreshes_degelo_from_etl_record():
    headers = ["product_code", "product_name", "categoria_armazenagem", "degelo", "curva"]
    existing = ["CT184788", "VINHO CHILENO BRANCO", "Geladeira", "", "A"]
    record = {
        "product_code": "CT184788",
        "product_name": "VINHO CHILENO BRANCO",
        "categoria_armazenagem": "Geladeira",
        "degelo": "PODE",
        "curva": "A",
    }

    merged = enrichment_pipeline._merge_preserved_allocated_row(existing, record, headers)

    assert merged[headers.index("degelo")] == "PODE"
