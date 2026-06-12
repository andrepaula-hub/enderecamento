from __future__ import annotations

from abc import ABC, abstractmethod


class AppsScriptGateway(ABC):
    """Contrato para execução de ações via Google Apps Script."""

    @abstractmethod
    def execute(self, action: str, payload: dict) -> dict:
        """Executa uma ação no Apps Script webapp.

        Args:
            action: Nome da ação a executar.
            payload: Dados a enviar junto com a ação.

        Returns:
            Resultado da execução como dicionário.
        """
