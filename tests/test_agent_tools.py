from core import agent_tools


class _FakeClient:
    def __init__(self, sheet_id, sheets, title="ENDERECAMENTO_DARK_PINHEIROS"):
        self.sheet_id = sheet_id
        self.sheets = sheets
        self.title = title

    def read_sheet(self, name):
        return self.sheets.get(name, [])

    def get_title(self):
        return self.title


def test_auto_address_preview_blocks_chemical_without_zone(monkeypatch):
    sheets = {
        agent_tools.SHEET_BASE_PRODUTOS: [
            {
                "product_code": "SKUQ",
                "product_name": "Limpa teste",
                "grupo": "quimico",
                "categoria_armazenagem": "seco",
                "escaninhos_necessarios": 1,
            }
        ],
        agent_tools.SHEET_PLANO_FINAL: [
            {
                "location_id": "LJ-R1-001-2A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "product_code": "Vazio",
            }
        ],
    }
    monkeypatch.setattr(agent_tools, "GSheetsClient", lambda sheet_id: _FakeClient(sheet_id, sheets))

    result = agent_tools.auto_address_preview("sheet-id")

    assert result["success"] is True
    assert result["summary"]["decision_required"] == 1
    assert result["summary"]["proposed_moves"] == 1
    assert result["decision_required"][0]["code"] == "chemical_zone_missing"


def test_auto_address_preview_blocks_missing_group_instead_of_inference(monkeypatch):
    sheets = {
        agent_tools.SHEET_BASE_PRODUTOS: [
            {
                "product_code": "SKUQ",
                "product_name": "AMACIANTE TESTE 1L",
                "categoria_site": "Limpeza",
                "subcategoria": "Amaciantes e Passadores",
                "categoria_armazenagem": "seco",
                "escaninhos_necessarios": 1,
            }
        ],
        agent_tools.SHEET_PLANO_FINAL: [
            {
                "location_id": "LJ-R1-001-2A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "product_code": "Vazio",
            }
        ],
    }
    monkeypatch.setattr(agent_tools, "GSheetsClient", lambda sheet_id: _FakeClient(sheet_id, sheets))

    result = agent_tools.auto_address_preview("sheet-id")

    assert result["success"] is False
    assert result["readiness_errors"][0]["code"] == "missing_group"


def test_auto_address_preview_leaves_missing_category_unallocated(monkeypatch):
    sheets = {
        agent_tools.SHEET_BASE_PRODUTOS: [
            {
                "product_code": "SKU1",
                "product_name": "Produto sem categoria",
                "grupo": "neutro",
                "categoria_armazenagem": "",
                "escaninhos_necessarios": 1,
            },
            {
                "product_code": "SKU2",
                "product_name": "Produto seco",
                "grupo": "alimento",
                "categoria_armazenagem": "seco",
                "escaninhos_necessarios": 1,
            },
        ],
        agent_tools.SHEET_PLANO_FINAL: [
            {
                "location_id": "LJ-R1-001-2A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "product_code": "Vazio",
            }
        ],
    }
    monkeypatch.setattr(agent_tools, "GSheetsClient", lambda sheet_id: _FakeClient(sheet_id, sheets))

    result = agent_tools.auto_address_preview("sheet-id")

    assert result["success"] is True
    assert result["summary"]["proposed_moves"] == 1
    assert result["summary"]["unallocated"] == 1
    assert result["summary"]["data_issue_unallocated"] == 1
    assert result["unallocated"][0]["product_code"] == "SKU1"
    assert "categoria_armazenagem" in result["unallocated"][0]["reasons"][0]


def test_auto_address_preview_respects_basic_hard_rules(monkeypatch):
    sheets = {
        agent_tools.SHEET_BASE_PRODUTOS: [
            {
                "product_code": "SKU1",
                "product_name": "Produto seco",
                "grupo": "alimento",
                "categoria_armazenagem": "seco",
                "escaninhos_necessarios": 1,
            },
            {
                "product_code": "SKU2",
                "product_name": "Produto refrigerado",
                "grupo": "alimento",
                "categoria_armazenagem": "refrigerado",
                "escaninhos_necessarios": 1,
            },
        ],
        agent_tools.SHEET_PLANO_FINAL: [
            {
                "location_id": "LJ-R1-001-1A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 1,
                "is_nivel_alto": True,
                "product_code": "Vazio",
            },
            {
                "location_id": "LJ-R1-001-2A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "product_code": "Vazio",
            },
            {
                "location_id": "LJ-R1-002-2A",
                "rua_num": 1,
                "equipamento_num": 2,
                "tipo_equipamento": "geladeira",
                "nivel": 2,
                "product_code": "Vazio",
            },
        ],
    }
    monkeypatch.setattr(agent_tools, "GSheetsClient", lambda sheet_id: _FakeClient(sheet_id, sheets))

    result = agent_tools.auto_address_preview("sheet-id")

    moves = result["proposed_moves"]
    assert result["summary"]["proposed_moves"] == 2
    assert {move["productCode"]: move["locNovoId"] for move in moves} == {
        "SKU1": "bin-LJ-R1-001-2A",
        "SKU2": "bin-LJ-R1-002-2A",
    }
    assert result["summary"]["uses_top_level"] is False


def test_auto_address_preview_blocks_normal_product_in_chemical_zone(monkeypatch):
    sheets = {
        agent_tools.SHEET_BASE_PRODUTOS: [
            {
                "product_code": "SKU1",
                "product_name": "Produto normal",
                "grupo": "alimento",
                "categoria_armazenagem": "seco",
                "escaninhos_necessarios": 1,
            }
        ],
        agent_tools.SHEET_PLANO_FINAL: [
            {
                "location_id": "LJ-R1-001-2A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "product_code": "Vazio",
            }
        ],
    }
    monkeypatch.setattr(agent_tools, "GSheetsClient", lambda sheet_id: _FakeClient(sheet_id, sheets))

    result = agent_tools.auto_address_preview("sheet-id", chemical_equipment_ids=["R1-E1"])

    assert result["summary"]["proposed_moves"] == 0
    assert result["summary"]["unallocated"] == 1


def test_auto_address_preview_blocks_flv_on_prateleira_levels_1_and_5(monkeypatch):
    sheets = {
        agent_tools.SHEET_BASE_PRODUTOS: [
            {
                "product_code": "SKUFLV",
                "product_name": "Banana",
                "grupo": "flv",
                "categoria_armazenagem": "seco",
                "escaninhos_necessarios": 1,
            }
        ],
        agent_tools.SHEET_PLANO_FINAL: [
            {
                "location_id": "LJ-R1-001-1A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 1,
                "is_nivel_alto": False,
                "product_code": "Vazio",
            },
            {
                "location_id": "LJ-R1-001-5A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 5,
                "product_code": "Vazio",
            },
            {
                "location_id": "LJ-R1-001-3A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 3,
                "product_code": "Vazio",
            },
        ],
    }
    monkeypatch.setattr(agent_tools, "GSheetsClient", lambda sheet_id: _FakeClient(sheet_id, sheets))

    result = agent_tools.auto_address_preview("sheet-id", allow_top_level=True)

    assert result["proposed_moves"][0]["locNovoId"] == "bin-LJ-R1-001-3A"


def test_auto_address_preview_allocates_multi_bin_as_atomic_run(monkeypatch):
    sheets = {
        agent_tools.SHEET_BASE_PRODUTOS: [
            {
                "product_code": "SKUMULTI",
                "product_name": "Produto grande",
                "grupo": "alimento",
                "categoria_armazenagem": "seco",
                "subcategoria": "massas",
                "escaninhos_necessarios": 3,
            }
        ],
        agent_tools.SHEET_PLANO_FINAL: [
            {
                "location_id": "LJ-R1-001-2A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "escaninho_num_no_nivel": 1,
                "product_code": "Vazio",
            },
            {
                "location_id": "LJ-R1-001-2B",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "escaninho_num_no_nivel": 2,
                "product_code": "Vazio",
            },
            {
                "location_id": "LJ-R1-001-2C",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "escaninho_num_no_nivel": 3,
                "product_code": "Vazio",
            },
        ],
    }
    monkeypatch.setattr(agent_tools, "GSheetsClient", lambda sheet_id: _FakeClient(sheet_id, sheets))

    result = agent_tools.auto_address_preview("sheet-id")

    assert result["summary"]["proposed_moves"] == 3
    assert result["summary"]["unallocated"] == 0


def test_auto_address_preview_does_not_partially_allocate_multi_bin(monkeypatch):
    sheets = {
        agent_tools.SHEET_BASE_PRODUTOS: [
            {
                "product_code": "SKUMULTI",
                "product_name": "Produto grande",
                "grupo": "alimento",
                "categoria_armazenagem": "seco",
                "escaninhos_necessarios": 3,
            }
        ],
        agent_tools.SHEET_PLANO_FINAL: [
            {
                "location_id": "LJ-R1-001-2A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "escaninho_num_no_nivel": 1,
                "product_code": "Vazio",
            },
            {
                "location_id": "LJ-R1-001-2C",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "escaninho_num_no_nivel": 3,
                "product_code": "Vazio",
            },
        ],
    }
    monkeypatch.setattr(agent_tools, "GSheetsClient", lambda sheet_id: _FakeClient(sheet_id, sheets))

    result = agent_tools.auto_address_preview("sheet-id")

    assert result["summary"]["proposed_moves"] == 0
    assert result["summary"]["unallocated"] == 1


def test_auto_address_preview_uses_curve_zones(monkeypatch):
    sheets = {
        agent_tools.SHEET_BASE_PRODUTOS: [
            {
                "product_code": "SKUA",
                "product_name": "Produto A",
                "grupo": "alimento",
                "categoria_armazenagem": "seco",
                "curva": "A",
                "escaninhos_necessarios": 1,
            }
        ],
        agent_tools.SHEET_PLANO_FINAL: [
            {
                "location_id": "LJ-R1-001-2A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "product_code": "Vazio",
            },
            {
                "location_id": "LJ-R2-001-2A",
                "rua_num": 2,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "product_code": "Vazio",
            },
        ],
    }
    monkeypatch.setattr(agent_tools, "GSheetsClient", lambda sheet_id: _FakeClient(sheet_id, sheets))

    result = agent_tools.auto_address_preview("sheet-id", curve_zones={"A": [2]})

    assert result["proposed_moves"][0]["locNovoId"] == "bin-LJ-R2-001-2A"


def test_auto_address_preview_supports_combined_street_and_type_scope(monkeypatch):
    sheets = {
        agent_tools.SHEET_BASE_PRODUTOS: [
            {
                "product_code": "SKU1",
                "product_name": "Produto seco",
                "grupo": "alimento",
                "categoria_armazenagem": "seco",
                "escaninhos_necessarios": 1,
            }
        ],
        agent_tools.SHEET_PLANO_FINAL: [
            {
                "location_id": "LJ-R1-001-2A",
                "rua_num": 1,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "product_code": "Vazio",
            },
            {
                "location_id": "LJ-R1-002-2A",
                "rua_num": 1,
                "equipamento_num": 2,
                "tipo_equipamento": "geladeira",
                "nivel": 2,
                "product_code": "Vazio",
            },
            {
                "location_id": "LJ-R2-001-2A",
                "rua_num": 2,
                "equipamento_num": 1,
                "tipo_equipamento": "prateleira",
                "nivel": 2,
                "product_code": "Vazio",
            },
        ],
    }
    monkeypatch.setattr(agent_tools, "GSheetsClient", lambda sheet_id: _FakeClient(sheet_id, sheets))

    result = agent_tools.auto_address_preview(
        "sheet-id",
        scope={"type": "store", "ruas": [1], "equipment_types": ["prateleira"]},
    )

    assert result["proposed_moves"][0]["locNovoId"] == "bin-LJ-R1-001-2A"


def test_infer_store_context_from_title(monkeypatch):
    monkeypatch.setattr(
        agent_tools,
        "GSheetsClient",
        lambda sheet_id: _FakeClient(sheet_id, {}, title="Conferência Produtos - [Pinheiros] (23)"),
    )

    result = agent_tools.infer_store_context("sheet-id")

    assert result["success"] is True
    assert result["store_name"] == "Pinheiros"


def test_infer_metabase_store_id_from_store_name():
    options = [
        {"value": "pinheiros", "label": "Pinheiros"},
        {"value": "vilaOlimpia", "label": "Vila Olímpia"},
    ]

    assert agent_tools.infer_metabase_store_id("ENDERECAMENTO_DARK_VILA OLIMPIA", options) == "vilaOlimpia"
