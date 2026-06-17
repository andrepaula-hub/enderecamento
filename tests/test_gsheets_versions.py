from __future__ import annotations

from pathlib import Path

import core.gsheets_versions as gv


class _FakeClient:
    def __init__(self, sheet_names=None):
        self._sheet_names = list(sheet_names or [])
        self.values = [["h1"], ["v1"]]
        self.cleared = []
        self.appended = []

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

    def delete_sheet(self, name):
        self._sheet_names = [item for item in self._sheet_names if item != name]


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
