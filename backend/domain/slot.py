from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Slot:
    """Representa um escaninho (posição física de armazenagem)."""

    location_id: str
    equipment_id: str
    level: int
    position: int
    capacidade_l: float | None = None
    is_hot_zone: bool = False
    is_nivel_alto: bool = False
    is_nivel_inferior: bool = False
    tipo_equipamento_final: str = ""
