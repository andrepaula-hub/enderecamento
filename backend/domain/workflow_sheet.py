from __future__ import annotations

from dataclasses import dataclass


@dataclass
class WorkflowSheet:
    """Representa a configuração de planilhas de um fluxo de endereçamento."""

    store_id: str
    target_sheet_id: str
    master_sheet_id: str = ""
    mix_sheet_id: str = ""
    target_title: str = ""
    master_title: str = ""
    mix_title: str = ""
    is_active: bool = False
