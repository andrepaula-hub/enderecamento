from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Move:
    """Representa uma movimentação de produto entre escaninhos."""

    from_location: str
    to_location: str
    product_id: str
    product_name: str = ""
    slot: str = ""
    quantity: int = 1
    extra: dict[str, Any] | None = None
