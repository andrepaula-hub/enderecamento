from __future__ import annotations

from abc import ABC, abstractmethod


class MetabaseGateway(ABC):
    """Contrato para consultas ao Metabase."""

    @abstractmethod
    def query_card(self, card_id: int, params: dict) -> list[dict]:
        """Executa uma query de um card do Metabase com parâmetros.

        Args:
            card_id: ID do card no Metabase.
            params: Parâmetros da query (filtros, etc.).

        Returns:
            Lista de dicionários com os resultados.
        """

    @abstractmethod
    def get_session(self, username: str, password: str) -> str:
        """Autentica no Metabase e retorna o token de sessão.

        Args:
            username: E-mail do usuário Metabase.
            password: Senha do usuário.

        Returns:
            Token de sessão Metabase.
        """
