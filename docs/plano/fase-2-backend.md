# Fase 2a — Modularização: Backend

Objetivo: criar a estrutura hexagonal sem quebrar o comportamento existente.
Estratégia: mover código em camadas, mantendo `app.py` funcionando até o fim da fase.

**Pode ser feita em paralelo com a Fase 2b (frontend) a partir de T2a-2.**

---

## T2a-1 — Criar estrutura de pastas hexagonal

Pré-requisito: Fase 1 concluída.

- [x] Criar estrutura de diretórios:
  ```
  backend/
    domain/
    application/
      workflow/
      catalog_etl/
      sales_target/
      card175/
      addressing/
      versioning/
      exports/
    ports/
    adapters/
      google_sheets/
      apps_script/
      metabase/
      sqlite/
      filesystem/
    entrypoints/
      api/
  ```
- [x] Criar `__init__.py` em cada diretório
- [x] Não mover nenhum código ainda — só esqueleto

### Checklist de aceite

- [x] Estrutura de pastas existe
- [x] `app.py` e `core/` continuam intactos e funcionando
- [x] `pytest tests/ -v` passa

---

## T2a-2 — Extrair entidades de domínio

Pode começar em paralelo com T2b-1 (frontend).

- [x] Criar `backend/domain/store.py` — entidade `Store`
- [x] Criar `backend/domain/product.py` — entidade `Product`
- [x] Criar `backend/domain/equipment.py` — entidade `Equipment`
- [x] Criar `backend/domain/slot.py` — entidade `Slot` (escaninho)
- [ ] Criar `backend/domain/street.py` — entidade `Street` (rua) — *pendente: estrutura de rua não mapeada no core ainda*
- [x] Criar `backend/domain/allocation.py` — entidade `Allocation`
- [x] Criar `backend/domain/move.py` — entidade `Move`
- [x] Criar `backend/domain/version.py` — entidade `Version`
- [x] Criar `backend/domain/workflow_sheet.py` — entidade `WorkflowSheet`

Regra: nenhuma entidade de domínio importa de `core/`, `fastapi`, `pandas` ou qualquer lib externa.

### Checklist de aceite

- [x] Todas as entidades existem como dataclasses ou classes puras
- [x] Nenhum import de infra nas entidades (`import fastapi`, `import pandas`, etc. → falha)
- [ ] Testes unitários básicos para cada entidade passam — *pendente: criar testes dedicados em fase seguinte*

---

## T2a-3 — Criar ports (contratos)

- [x] `backend/ports/sheet_gateway.py` — interface `SheetGateway`
  - `read_values(sheet_id, tab) -> list[list]`
  - `write_values(sheet_id, tab, data) -> None`
  - `list_tabs(sheet_id) -> list[str]`
  - `append_rows(sheet_id, tab, rows) -> None`
- [x] `backend/ports/metabase_gateway.py` — interface `MetabaseGateway`
  - `query_card(card_id, params) -> list[dict]`
  - `get_session(username, password) -> str`
- [x] `backend/ports/apps_script_gateway.py` — interface `AppsScriptGateway`
  - `execute(action, payload) -> dict`
- [x] `backend/ports/workflow_repo.py` — interface `WorkflowRepository`
  - `save(workflow) -> None`
  - `get_by_store(store_id) -> WorkflowSheet | None`
  - `get_active() -> WorkflowSheet | None`
  - `set_active(sheet_id) -> None`
- [x] `backend/ports/job_runner.py` — interface `JobRunner`
  - `enqueue(job_type, payload) -> str`
  - `get_status(job_id) -> dict`

### Checklist de aceite

- [x] Todos os ports são ABCs (`abc.ABC` + `@abstractmethod`)
- [x] Nenhum port importa implementação concreta
- [x] Ports têm docstrings descrevendo o contrato

---

## T2a-4 — Implementar adapters

Mover código de `core/` para `backend/adapters/`, implementando os ports.

- [x] `backend/adapters/google_sheets/sheets_adapter.py`
  - Implementa `SheetGateway` delegando para `core/gsheets_client.py`
- [x] `backend/adapters/apps_script/apps_script_adapter.py`
  - Implementa `AppsScriptGateway` delegando para `core/apps_script_client.py`
- [x] `backend/adapters/metabase/metabase_adapter.py`
  - Implementa `MetabaseGateway` delegando para `core/metabase_sales.py`
- [x] `backend/adapters/sqlite/workflow_repo.py`
  - Implementa `WorkflowRepository` com SQLite stdlib
  - DB path: `Path(".credentials/app.db")` configurável
  - Lê `.credentials/workflow_context.json` como fallback se DB vazio (migração gradual)
- [x] `backend/adapters/filesystem/export_storage.py`
  - `save_export(name, content) -> Path`
  - `get_export_path(name) -> Path`
  - Usa `outputs/` como base

### Checklist de aceite

- [x] Cada adapter implementa seu port
- [ ] Testes dos adapters passam com fixtures — *pendente: criar testes de adapter em fase seguinte*
- [x] `core/` não foi deletado — adapters envolvem (wrap) código existente

---

## T2a-5 — Extrair casos de uso para application/

- [x] `backend/application/workflow/connect_sheets.py` — `connect_workflow_sheets`
  - Extrai de `app.py:232` (`/api/connectWorkflowSheets`)
- [x] `backend/application/catalog_etl/run_etl.py` — `run_etl`
  - Wrap de `core/enrichment_pipeline.py:858` (`run_etl_to_base_products`)
- [ ] `backend/application/sales_target/build_sales_target.py` — *pendente: extraído na fase 2b*
- [ ] `backend/application/card175/import_card175.py` — *pendente: extraído na fase 2b*
- [x] `backend/application/addressing/load_state.py` — `load_addressing_state`
  - Wrap de `app.py:619` (`/api/getInitialData`)
- [x] `backend/application/addressing/save_moves.py` — `save_moves`
  - Wrap de `core/gsheets_backend.save_batch_moves_gsheet`
- [x] `backend/application/versioning/save_version.py` — `save_version`
  - Wrap de `core/gsheets_backend.save_plano_version_gsheet`
- [x] `backend/application/versioning/list_versions.py` — `list_versions`
- [x] `backend/application/versioning/restore_version.py` — `restore_version`
- [x] `backend/application/exports/generate_kdabra.py` — `generate_kdabra`
  - Wrap de `core/gsheets_backend.generate_kdabra_sheet_gsheet`

Regra: use cases recebem ports por injeção de dependência, não importam adapters diretamente.

### Checklist de aceite

- [x] Cada use case recebe seus ports como parâmetro (injeção de dependência)
- [x] Nenhum use case importa `fastapi`, `gsheets_client`, `metabase_sales` diretamente
- [ ] Testes dos use cases passam com mocks — *pendente: criar testes de use cases em fase seguinte*

---

## T2a-6 — Criar entrypoints e migrar rotas

- [x] `backend/entrypoints/api/routes.py` — novas rotas semânticas:
  - `POST /api/workflows/connect-sheets`
  - `GET /api/workflows/active`
  - `POST /api/etl/run`
  - `GET /api/addressing/state`
  - `POST /api/addressing/moves`
  - `POST /api/addressing/versions`
  - `GET /api/addressing/versions`
  - `POST /api/addressing/versions/{version_id}/restore`
  - `POST /api/exports/kdabra`
  - `GET /api/stores`

- [x] Router incluído em `app.py` via `app.include_router(new_router, prefix="")`
- [x] Rotas antigas em `app.py` continuam funcionando (não modificadas)

### Checklist de aceite

- [x] Todas as novas rotas declaradas em `backend/entrypoints/api/routes.py`
- [x] Rotas legadas ainda funcionam
- [x] `pytest tests/ -v` passa integralmente (107 testes)
- [ ] Nenhuma regra de negócio em `app.py` — *pendente: app.py ainda contém lógica (fase 2b concluirá)*

---

## Critério de saída da Fase 2a

- [x] T2a-1 até T2a-6 concluídos (com pendências menores documentadas)
- [x] `pytest tests/ -v` passa — **107 testes passando**
- [x] Sistema sobe e todas as funcionalidades do front atual continuam operando
- [ ] `core/` pode ser deletado sem quebrar nada — *pendente: fase 2b*
- [ ] `app.py` tem menos de 100 linhas — *pendente: fase 2b*

### Pendências registradas para fase 2b

1. `backend/domain/street.py` — entidade Street não mapeada no core; criar quando estiver claro o modelo
2. Testes unitários para entidades, adapters e use cases (sem hits de infra real)
3. `backend/application/sales_target/` e `backend/application/card175/` — extraídos na fase 2b
4. Remoção de lógica de negócio de `app.py` (encurtar para < 100 linhas)
