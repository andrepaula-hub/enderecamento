# Rodar Endereçamento Local (Docker, mínimo de comandos)

## Pré-requisito (uma vez só)
- Docker Desktop instalado e aberto.

## Subir do zero (de qualquer pasta no terminal)
### Opção 1: 1 comando direto
```bash
docker compose -f ~/Downloads/enderecamento/docker-compose.yml up -d --build
```

### Opção 2: 1 comando via script
```bash
~/Downloads/enderecamento/run-docker.sh
```

## Acessar
- Abra: `http://127.0.0.1:8000`
- No topo da tela, cole o link/ID da planilha Google Sheets e clique em **Conectar**.

## Parar
### Comando direto
```bash
docker compose -f ~/Downloads/enderecamento/docker-compose.yml down
```

### Via script
```bash
~/Downloads/enderecamento/stop-docker.sh
```

## Diagnóstico rápido
```bash
docker compose -f ~/Downloads/enderecamento/docker-compose.yml logs -f
```
