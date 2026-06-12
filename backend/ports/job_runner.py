from __future__ import annotations

from abc import ABC, abstractmethod


class JobRunner(ABC):
    """Contrato para enfileiramento e monitoramento de jobs assíncronos."""

    @abstractmethod
    def enqueue(self, job_type: str, payload: dict) -> str:
        """Enfileira um job para execução assíncrona.

        Args:
            job_type: Tipo/nome do job a executar.
            payload: Dados necessários para o job.

        Returns:
            job_id: Identificador único do job enfileirado.
        """

    @abstractmethod
    def get_status(self, job_id: str) -> dict:
        """Retorna o status atual de um job.

        Args:
            job_id: Identificador do job.

        Returns:
            Dicionário com status (pending/running/done/failed) e resultado se disponível.
        """
