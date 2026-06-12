# Fase 1 — Estabilização

Objetivo: congelar o comportamento atual antes de tocar em qualquer código.
Nada muda em lógica nesta fase. Só documentamos e protegemos.

**Subtarefas A e B podem ser feitas em paralelo.**

---

## A — Mapear contratos existentes

### Tarefas

- [x] **T1a-1** — Listar todas as rotas de `app.py` com método, path e o que fazem
  - Fonte: `app.py` linhas 107–1200 (50+ rotas `@app.post /api/*`)
  - Saída: `docs/contratos/rotas.md`

- [x] **T1a-2** — Mapear cada rota ao caso de uso correspondente
  - Exemplo: `POST /api/runEtlToBaseProducts` → caso de uso `run_etl`
  - Saída: tabela em `docs/contratos/rotas.md`

- [x] **T1a-3** — Documentar os contratos de request/response das rotas usadas pelo front
  - Focar nas chamadas reais de `dse-data.js` (linhas 266–286)
  - Saída: `docs/contratos/api-atual.md`

- [x] **T1a-4** — Listar o que existe no backend mas não aparece no front
  - Fonte: `FRONT_LIMITACOES.md` (já existe — revisado e completo)

### Checklist de aceite

- [x] Todas as 50+ rotas têm descrição e caso de uso mapeado
- [x] Contratos das rotas usadas pelo front estão documentados com exemplos de payload
- [x] `FRONT_LIMITACOES.md` está atualizado e completo

---

## B — Proteger o comportamento atual com testes

### Tarefas

- [x] **T1b-1** — Rodar suite atual e anotar quais passam/falham
  - 75 testes passando. Saída em `docs/plano/baseline-tests.txt`

- [x] **T1b-2** — Identificar casos de uso sem cobertura de teste
  - `run_etl`, `import_card175`, `save_moves`, `save_version`, `restore_version` sem testes de integração reais (dependem de Sheets API)
  - Cobertos por testes de contrato na T1b-3

- [x] **T1b-3** — Escrever testes de contrato para as rotas críticas
  - `tests/test_contract_routes.py` — 32 testes cobrindo:
    `getWorkflowSheets`, `getInitialData`, `saveBatchMoves`, `savePlanoVersion`,
    `listPlanoVersions`, `restorePlanoVersion`, `getMapLoadStatus`, catch-all
  - Descoberta: `get_active_sheet` importado diretamente em `app.py` — patch deve ser `app.get_active_sheet`
  - `httpx<0.28` adicionado ao `requirements.txt` (starlette 0.36 não é compatível com 0.28+)

- [x] **T1b-4** — `pytest tests/ -v` passa 100%
  - 107/107 passando (75 originais + 32 de contrato)

### Checklist de aceite

- [x] `pytest tests/ -v` passa sem falhas no repo `frontend-shopper`
- [x] Arquivo `docs/plano/baseline-tests.txt` gerado
- [x] Testes de contrato para as rotas críticas existem e passam
- [x] Nenhum arquivo de `core/` ou `app.py` foi modificado nesta fase

---

## Critério de saída da Fase 1

- [x] T1a-1 até T1a-4 concluídos
- [x] T1b-1 até T1b-4 concluídos
- [ ] Sistema sobe normalmente (`docker-compose up` ou `uvicorn app:app`)
- [x] Nenhuma regressão introduzida
