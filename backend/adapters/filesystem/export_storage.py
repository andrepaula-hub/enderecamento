from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from backend.config import OUTPUTS_PATH

_DEFAULT_BASE = OUTPUTS_PATH


class ExportStorage:
    """Gerencia arquivos de exportação em disco (diretório outputs/).

    Gera nomes com timestamp UTC para evitar colisões e facilitar ordenação.
    """

    def __init__(self, base_path: Path | None = None) -> None:
        self._base = base_path or _DEFAULT_BASE
        self._base.mkdir(parents=True, exist_ok=True)

    def save_export(self, name: str, content: bytes, ext: str = ".xlsx") -> Path:
        """Salva bytes como arquivo de exportação com timestamp.

        Args:
            name: Prefixo do arquivo (sem extensão).
            content: Conteúdo binário do arquivo.
            ext: Extensão do arquivo (padrão: .xlsx).

        Returns:
            Caminho absoluto do arquivo salvo.
        """
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = self._base / f"{name}_{ts}{ext}"
        path.write_bytes(content)
        return path.resolve()

    def get_export_path(self, name: str) -> Path | None:
        """Retorna o arquivo mais recente com o prefixo `name`.

        Args:
            name: Prefixo do arquivo (sem extensão e sem timestamp).

        Returns:
            Path do arquivo mais recente ou None se não encontrado.
        """
        matches = sorted(self._base.glob(f"{name}_*"), reverse=True)
        return matches[0].resolve() if matches else None

    def list_exports(self) -> list[dict]:
        """Lista todos os arquivos de exportação, do mais recente ao mais antigo.

        Returns:
            Lista de dicts com 'name' e 'size' (bytes).
        """
        files = sorted(
            self._base.iterdir(),
            key=lambda f: f.stat().st_mtime,
            reverse=True,
        )
        return [
            {"name": f.name, "size": f.stat().st_size}
            for f in files
            if f.is_file()
        ]
