from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Store:
    """Representa uma loja (fulfillment center)."""

    id: str
    nome: str
    codigo: str = ""
    metabase_id: str = ""
    keywords: list[str] = field(default_factory=list)
