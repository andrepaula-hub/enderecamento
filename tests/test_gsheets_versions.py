from __future__ import annotations

from pathlib import Path

import core.gsheets_versions as gv


class _FakeClient:
    def __init__(self, sheet_names=None):
        self._sheet_names = list(sheet_names or [])
        self.values = [["h1"], ["v1"]]
        self.cleared = []
        self.appended = []
        self.resized = []

    def list_sheet_names(self):
        return list(self._sheet_names)

    def read_values(self, name):
        return self.values if name == gv.SHEET_PLANO_FINAL else []

    def ensure_sheet(self, name):
        if name not in self._sheet_names:
            self._sheet_names.append(name)

    def clear_sheet(self, name):
        self.cleared.append(name)

    def append_rows(self, name, rows):
        self.appended.append((name, rows))

    def resize_sheet(self, name, row_count, column_count):
        self.resized.append((name, row_count, column_count))

    def replace_sheet_values(self, name, rows):
        self.cleared.append(name)
        self.appended.append((name, rows))

    def delete_sheet(self, name):
        self._sheet_names = [item for item in self._sheet_names if item != name]

    def get_sheet_url(self, name):
        return f"https://docs.google.com/spreadsheets/d/fake/edit#sheet={name}"


def test_build_version_sheet_name_uses_readable_suffix_counter():
    client = _FakeClient(
        [
            "Plano_Enderecamento_Final",
            "teste-quimicos-curvaAeB_ENDERECAMENTO[1]",
        ]
    )

    name = gv._build_version_sheet_name(client, "teste-quimicos-curvaAeB")

    assert name == "teste-quimicos-curvaAeB_ENDERECAMENTO[2]"


def test_list_versions_gsheet_uses_metadata_timestamp(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(gv, "VERSION_METADATA_PATH", tmp_path / "versions.json")
    gv._write_version_metadata(
        {
            "sheet-1": {
                "teste_ENDERECAMENTO[1]": {
                    "display_name": "teste_ENDERECAMENTO[1]",
                    "created_at": "2026-06-17T08:54:10-03:00",
                }
            }
        }
    )
    monkeypatch.setattr(gv, "GSheetsClient", lambda sheet_id: _FakeClient(["teste_ENDERECAMENTO[1]"]))

    result = gv.list_plano_versions_gsheet("sheet-1")

    assert result["success"] is True
    assert result["versions"][0]["label"] == "teste_ENDERECAMENTO[1]"
    assert result["versions"][0]["timestamp"] == "2026-06-17T08:54:10-03:00"


def test_save_version_compacts_source_and_replaces_target_values(monkeypatch, tmp_path: Path):
    fake = _FakeClient([gv.SHEET_PLANO_FINAL])
    fake.values = [["h1", "h2"], ["v1", "v2"]]
    monkeypatch.setattr(gv, "VERSION_METADATA_PATH", tmp_path / "versions.json")
    monkeypatch.setattr(gv, "GSheetsClient", lambda sheet_id: fake)

    result = gv.save_plano_version_gsheet("sheet-1", "teste")

    assert result["success"] is True
    assert fake.resized == [(gv.SHEET_PLANO_FINAL, 2, 2)]
    assert fake.appended == [("teste_ENDERECAMENTO[1]", fake.values)]
