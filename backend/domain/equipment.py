from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Equipment:
    """Representa um equipamento de armazenagem (prateleira, geladeira, freezer, etc.)."""

    id: str
    type: str
    rua: str = ""
    galpao_id: str = ""
    num: int = 0
    slots: list[str] = field(default_factory=list)
    """Lista de location_ids dos escaninhos deste equipamento."""
