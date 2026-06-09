#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker compose -f "$ROOT_DIR/docker-compose.yml" up -d --build

echo "Servidor no ar: http://127.0.0.1:8000"
echo "Depois conecte sua planilha no topo da tela (link/ID do Google Sheets)."
