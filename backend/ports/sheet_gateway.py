from __future__ import annotations

from abc import ABC, abstractmethod


class SheetGateway(ABC):
    """Contrato para acesso a planilhas (Google Sheets ou qualquer backend de sheet)."""

    @abstractmethod
    def read_values(self, sheet_id: str, tab: str) -> list[list]:
        """Lê todos os valores de uma aba.

        Args:
            sheet_id: ID da planilha.
            tab: Nome da aba.

        Returns:
            Lista de linhas, cada linha é uma lista de valores.
        """

    @abstractmethod
    def write_values(self, sheet_id: str, tab: str, data: list[list]) -> None:
        """Sobrescreve os valores de uma aba.

        Args:
            sheet_id: ID da planilha.
            tab: Nome da aba.
            data: Lista de linhas a escrever.
        """

    @abstractmethod
    def list_tabs(self, sheet_id: str) -> list[str]:
        """Retorna os nomes de todas as abas da planilha.

        Args:
            sheet_id: ID da planilha.

        Returns:
            Lista de nomes de abas.
        """

    @abstractmethod
    def append_rows(self, sheet_id: str, tab: str, rows: list[list]) -> None:
        """Acrescenta linhas ao final de uma aba.

        Args:
            sheet_id: ID da planilha.
            tab: Nome da aba.
            rows: Linhas a acrescentar.
        """
