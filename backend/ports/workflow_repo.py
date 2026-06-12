from __future__ import annotations

from abc import ABC, abstractmethod

from backend.domain.workflow_sheet import WorkflowSheet


class WorkflowRepository(ABC):
    """Contrato para persistência de configurações de fluxo de planilhas."""

    @abstractmethod
    def save(self, workflow: WorkflowSheet) -> None:
        """Persiste (insere ou atualiza) um WorkflowSheet.

        Args:
            workflow: Configuração de planilhas a salvar.
        """

    @abstractmethod
    def get_by_store(self, store_id: str) -> WorkflowSheet | None:
        """Retorna o workflow associado a uma loja.

        Args:
            store_id: Identificador da loja.

        Returns:
            WorkflowSheet se encontrado, None caso contrário.
        """

    @abstractmethod
    def get_active(self) -> WorkflowSheet | None:
        """Retorna o workflow marcado como ativo.

        Returns:
            WorkflowSheet ativo, ou None se nenhum ativo.
        """

    @abstractmethod
    def set_active(self, sheet_id: str) -> None:
        """Marca um workflow como ativo pelo target_sheet_id.

        Args:
            sheet_id: ID da planilha de endereçamento a tornar ativa.
        """
