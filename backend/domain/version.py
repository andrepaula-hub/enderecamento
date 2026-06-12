from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Version:
    """Representa uma versão salva do plano de endereçamento."""

    id: str
    name: str
    saved_at: str = ""
    rows: list[dict[str, Any]] = field(default_factory=list)
    label: str = ""
