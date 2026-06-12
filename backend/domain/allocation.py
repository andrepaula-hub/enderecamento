from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Allocation:
    """Representa a alocação de um produto em um escaninho."""

    slot_id: str
    product_id: str
    quantity: int = 1
