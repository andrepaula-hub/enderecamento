from __future__ import annotations

from backend.ports.sheet_gateway import SheetGateway


class GoogleSheetsAdapter(SheetGateway):
    """Implementa SheetGateway delegando para core.gsheets_client.GSheetsClient."""

    def read_values(self, sheet_id: str, tab: str) -> list[list]:
        from core.gsheets_client import GSheetsClient  # lazy import para evitar import circular
        client = GSheetsClient(sheet_id)
        return client.read_values(tab)

    def write_values(self, sheet_id: str, tab: str, data: list[list]) -> None:
        from core.gsheets_client import GSheetsClient
        client = GSheetsClient(sheet_id)
        client.clear_sheet(tab)
        if data:
            client.update_range(tab, data)

    def list_tabs(self, sheet_id: str) -> list[str]:
        from core.gsheets_client import GSheetsClient
        client = GSheetsClient(sheet_id)
        return client.list_sheet_names()

    def append_rows(self, sheet_id: str, tab: str, rows: list[list]) -> None:
        from core.gsheets_client import GSheetsClient
        client = GSheetsClient(sheet_id)
        client.append_rows(tab, rows)
