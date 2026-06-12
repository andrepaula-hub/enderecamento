# Plano de Refatoração — Endereçamento

Repositório de trabalho: `enderecamento-frontend-shopper` (branch `frontend-shopper`)
Repositório original preservado: `enderecamento` (branch `main`) — **não tocar**

## Arquitetura alvo

Hexagonal Modular Monolith · Docker + 12-factor · cloud-agnostic

```
backend/          FastAPI — camadas domain / application / ports / adapters / entrypoints
frontend/         React + TypeScript + Vite — build estático
SQLite            contexto de workflow e OAuth state (substitui .credentials/*.json)
Google Sheets     fonte de verdade + storage de versões
```

Sem Postgres, Redis ou S3. Apps Script encapsulado por Port como adapter temporário.

## Visão geral das fases

| Fase | Nome | Pode ser paralela? |
|------|------|--------------------|
| [1](fase-1-estabilizacao.md) | Estabilização | Subtarefas A e B em paralelo |
| [2a](fase-2-backend.md) | Modularização — Backend | Paralela com Fase 2b após T2a-1 |
| [2b](fase-2-frontend.md) | Modularização — Frontend | Paralela com Fase 2a |
| [3](fase-3-persistencia.md) | Persistência e jobs | Após Fase 2a e 2b completas |
| [4](fase-4-deploy.md) | Deploy e CI/CD | Após Fase 3 |

## Regra geral de aceite

Uma fase só está concluída quando:
- Todos os itens do checklist da fase estão marcados
- Os testes existentes continuam passando (`pytest tests/ -v`)
- O sistema sobe e funciona ponta a ponta localmente

## Sobre o CI/CD

O repo `ci-cd-pipeline-ponderada` tem um `ci.yml` com ruff + pytest + mypy.
**Não ativar agora.** O pipeline quebraria constantemente durante a refatoração.
Ativar na Fase 4, copiando o workflow e adaptando para a nova estrutura.

## Convenção de status nos arquivos de fase

- `[ ]` — não iniciado
- `[~]` — em andamento
- `[x]` — concluído
