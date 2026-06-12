from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Product:
    """Representa um produto do catálogo."""

    id: str
    nome: str
    grupo: str = ""
    curva: str = ""
    categoria_armazenagem: str = ""
    subcategoria: str = ""
    categoria_site: str = ""
    nm_fabricante: str = ""
    altura_cm: float | None = None
    peso_kg_unitario: float | None = None
    vol_l_unitario: float | None = None
    venda_total: float | None = None
    is_pesado: bool = False
    is_alto: bool = False
    extra: dict[str, Any] = field(default_factory=dict)
