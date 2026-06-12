# Fase 3 — Persistência e Jobs

Objetivo: substituir `.credentials/*.json` por SQLite e desacoplar jobs pesados do ciclo HTTP.

Pré-requisito: Fase 2a e Fase 2b concluídas.

---

## T3-1 — Migrar contexto de workflow para SQLite

Substituir `.credentials/workflow_context.json` e `.credentials/active_sheet.json`.

- [x] Criar schema SQLite em `backend/adapters/sqlite/schema.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS workflow_sheets (
    store_id TEXT PRIMARY KEY,
    target_sheet_id TEXT NOT NULL,
    master_sheet_id TEXT,
    mix_sheet_id TEXT,
    connected_at TEXT NOT NULL,
    last_verified_at TEXT
  );
  ```
  Nota: o `WorkflowRepository` existente (Fase 2a) usa `target_sheet_id` como PK e `is_active` como flag.
  O schema.sql documenta o modelo canônico; o repo opera com o schema legado para manter compatibilidade.
- [x] Implementar `WorkflowRepository` (já criado em T2a-4) — `_ensure_table` funciona como `_init_db()`
- [x] Script de migração `scripts/migrate_credentials_to_sqlite.py`
  - Lê `.credentials/workflow_context.json` (master + mix)
  - Lê `.credentials/active_sheet.json` (target)
  - Faz backup `.bak` antes de migrar
  - Insere no SQLite (INSERT OR REPLACE via raw sqlite3)
- [ ] Atualizar `docker-compose.yml` para montar volume do SQLite *(pendente — não existe docker-compose no projeto)*

### Checklist de aceite

- [x] `POST /api/workflows/connect-sheets` persiste no SQLite (via `repo.save()`)
- [x] `GET /api/workflows/active` lê do SQLite (via `repo.get_active()`)
- [x] Sistema sobe sem `.credentials/workflow_context.json` presente (fallback no repo)
- [x] Script de migração roda sem erros em dados reais
- [ ] `.credentials/*.json` de contexto podem ser deletados (token.json e client_secret.json continuam) *(pendente T3-2 completo)*

---

## T3-2 — Migrar OAuth state para SQLite

- [x] Criar tabela `oauth_tokens` no schema SQLite (`backend/adapters/sqlite/schema.sql`)
- [x] Criar `backend/adapters/sqlite/token_repo.py` com `SQLiteTokenRepository`
  - `save_token(service, token_dict)` — upsert
  - `load_token(service)` — leitura
- [ ] Atualizar `backend/adapters/google_sheets/sheets_adapter.py` para ler/escrever token do SQLite *(Fase 4)*
- [ ] Manter fallback para `.credentials/token.json` durante transição *(Fase 4)*

### Checklist de aceite

- [ ] Auth Google Sheets funciona com token vindo do SQLite *(Fase 4)*
- [ ] Re-autenticação persiste corretamente *(Fase 4)*
- [ ] `.credentials/token.json` não é mais necessário após migração *(Fase 4)*

Nota: `core/gsheets_client.py` continua lendo do arquivo. Infra preparada, migração completa na Fase 4.

---

## T3-3 — Desacoplar jobs pesados com BackgroundTasks

Jobs candidatos (>5s de execução por dependerem de múltiplas chamadas Sheets API):
- `run_etl` (~12 chamadas Sheets API)
- `import_card175_metabase` (múltiplas leituras + escritas)
- `build_sales_target` (chamada Metabase + Sheets)

- [x] Criar tabela `jobs` no SQLite (em `backend/adapters/sqlite/schema.sql` e auto-criada no `JobService._init_table()`)
- [x] Criar `backend/application/jobs/job_service.py`
  - `enqueue(job_type, payload) -> job_id`
  - `update(job_id, status, result, error)`
  - `get(job_id) -> dict | None`
- [x] Atualizar rota `POST /api/etl/run` em `backend/entrypoints/api/routes.py`:
  - Enfileira job com `BackgroundTasks`
  - Retorna `{ job_id: "...", status: "pending" }`
  - Função `_run_etl_job` atualiza status no SQLite
- [x] Criar rota `GET /api/jobs/{job_id}` — polling de status
- [x] Atualizar rota legada `POST /api/runEtlToBaseProducts` em `app.py`:
  - Usa BackgroundTasks — retorna `{ success: True, job_id: "...", status: "pending" }`
  - Mantém lógica de geração automática do Plano_Enderecamento_Final em background
- [x] Atualizar frontend (`frontend/src/api/etl.ts`) com `JobResponse`, `runEtl`, `getJobStatus`
- [x] Atualizar `frontend/src/pages/ConfigPage.tsx` com polling via TanStack Query:
  - `useMutation(runEtlMutation)` dispara job e recebe `job_id`
  - `useQuery(['job', etlJobId], ..., { refetchInterval: 2000 })` até status `done/failed`
  - `useEffect` reage ao fim do job para atualizar logs e status
- [ ] Atualizar rota `POST /api/card175/import` *(pendente — T3-3 parcial)*
- [ ] Timeout de job configurável via env var `JOB_TIMEOUT_SECONDS` *(pendente)*

### Checklist de aceite

- [x] `POST /api/etl/run` retorna imediatamente com `job_id`
- [x] Front mostra loading enquanto job roda, resultado ao completar
- [x] `GET /api/jobs/{job_id}` retorna status correto
- [x] Job falho persiste `error` e front exibe mensagem de erro
- [ ] Timeout de job configurável via env var `JOB_TIMEOUT_SECONDS` *(pendente)*

---

## T3-4 — Organizar outputs locais

- [x] Atualizar `backend/adapters/filesystem/export_storage.py`:
  - `save_export(name, content, ext)` — gera nome com timestamp UTC
  - `get_export_path(name)` — busca arquivo mais recente pelo prefixo
  - `list_exports()` — lista todos os arquivos ordenados por mtime
- [x] Criar `outputs/.gitkeep` para o diretório existir no repo
- [x] Criar `scripts/` com `__init__.py`
- [ ] Remover exports espalhados por `core/` — centralizar aqui *(pendente refatoração futura)*
- [ ] `outputs/` montado como volume no Docker *(pendente — não existe docker-compose no projeto)*

### Checklist de aceite

- [x] `ExportStorage.save_export` gera nomes com timestamp sem colisão
- [x] `ExportStorage.get_export_path` retorna arquivo mais recente pelo prefixo
- [x] `ExportStorage.list_exports` lista todos os arquivos ordenados
- [ ] Downloads de KDABRA, KDABTA e layout atual usam `ExportStorage` *(pendente refatoração)*
- [ ] Nenhum export sendo salvo em path hardcoded fora de `outputs/` *(pendente refatoração)*

---

## Critério de saída da Fase 3

- [x] T3-1 concluído (schema, script migração, rotas semânticas via SQLite)
- [x] T3-2 infra preparada (SQLiteTokenRepository criado, migração completa na Fase 4)
- [x] T3-3 concluído para ETL (BackgroundTasks + polling + frontend)
- [x] T3-4 concluído (ExportStorage com timestamp, outputs/.gitkeep)
- [ ] `.credentials/workflow_context.json` e `.credentials/active_sheet.json` não são mais usados *(soft-removível após rodar script de migração)*
- [x] Jobs pesados (ETL) não travam o ciclo HTTP
- [x] `pytest tests/ -v` passa — 107/107 testes
- [x] `npm run build` em `frontend/` passa sem erros
- [ ] Sistema sobe do zero com `docker-compose up` sem arquivos de `.credentials/` de contexto *(docker-compose não existe no projeto)*

---

## Pendências para Fase 4

- Migração completa do `token.json` para SQLite (`SQLiteTokenRepository`)
- Atualizar `core/gsheets_client.py` para usar `SQLiteTokenRepository` com fallback ao arquivo
- Converter `POST /api/importCard175Metabase` para BackgroundTasks
- Converter `POST /api/buildMetabaseSalesTarget` para BackgroundTasks
- Centralizar todos os exports de `core/` em `ExportStorage`
- Timeout de job via env var `JOB_TIMEOUT_SECONDS`
