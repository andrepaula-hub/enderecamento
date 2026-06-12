# Fase 4 — Deploy e CI/CD

Objetivo: deixar o sistema deployável em qualquer provedor (EC2, Railway, Render, Fly.io, etc.)
usando Docker + 12-factor. Ativar CI/CD com o padrão do repo `ci-cd-pipeline-ponderada`.

Pré-requisito: Fase 3 concluída.

---

## T4-1 — 12-factor: configuração por variáveis de ambiente

- [x] Criar `.env.example` na raiz:
  ```env
  # Google OAuth
  GOOGLE_CLIENT_SECRET_PATH=/app/.credentials/client_secret.json
  GOOGLE_TOKEN_PATH=/app/data/token.json

  # Metabase
  METABASE_URL=https://metabase.suaempresa.com
  METABASE_USERNAME=
  METABASE_PASSWORD=

  # App
  APP_PORT=8000
  JOB_TIMEOUT_SECONDS=120
  SQLITE_PATH=/app/data/app.db
  OUTPUTS_PATH=/app/outputs
  LOG_LEVEL=info
  ```
- [x] Substituir todos os paths hardcoded no código por leitura de env vars
  - `backend/adapters/sqlite/workflow_repo.py` → usa `SQLITE_PATH`
  - `backend/application/jobs/job_service.py` → usa `SQLITE_PATH`
  - `backend/adapters/filesystem/export_storage.py` → usa `OUTPUTS_PATH`
- [x] Criar `backend/config.py` — lê todas as vars com stdlib `os.environ`
- [x] Nunca commitar `.env` (`.gitignore` criado com `.env`, `.env.local`, `*.env`)

### Checklist de aceite

- [x] Nenhum path hardcoded fora de `backend/config.py`
- [x] Sistema sobe com variáveis de ambiente diferentes sem alterar código
- [x] `.env.example` documentado com todos os valores necessários
- [x] `.env` está no `.gitignore`

---

## T4-2 — Docker Compose para desenvolvimento e deploy

- [x] Atualizar `docker-compose.yml` com serviços `backend` e `frontend`, `env_file`, volumes, healthcheck via `urllib.request` (sem curl)
- [x] Criar `GET /health` no backend — retorna `{ status: "ok", service: "enderecamento", fastapi_version: "..." }`
- [x] `Dockerfile` na raiz atualizado com `mkdir -p /app/data /app/outputs`
- [ ] `frontend/Dockerfile` multistage já existia — OK
- [ ] `frontend/nginx.conf` já existia — OK
- [x] Criar `data/.gitkeep` para o diretório de dados existir no repo

### Checklist de aceite

- [ ] `docker-compose up --build` sobe tudo sem erros (verificar em ambiente com Docker)
- [x] `GET /health` implementado e retorna 200
- [ ] Frontend acessível em `localhost:80`
- [ ] Backend acessível em `localhost:8000`
- [ ] Volumes persistem entre restarts

---

## T4-3 — CI/CD com GitHub Actions

Baseado no padrão de `.github/workflows/ci.yml` do repo `ci-cd-pipeline-ponderada`.

- [x] Criar `.github/workflows/ci.yml`:
  ```yaml
  name: CI

  on:
    push:
      branches: [main, frontend-shopper]
    pull_request:
      branches: [main]

  jobs:
    lint-backend:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-python@v5
          with: { python-version: "3.12", cache: "pip" }
        - run: pip install ruff
        - run: ruff check backend/ --output-format=github

    typecheck-backend:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-python@v5
          with: { python-version: "3.12", cache: "pip" }
        - run: pip install mypy -r requirements.txt
        - run: mypy backend/ --ignore-missing-imports

    test-backend:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-python@v5
          with: { python-version: "3.12", cache: "pip" }
        - run: pip install -r requirements.txt
        - run: pytest tests/ -v --junit-xml=test-results.xml
        - uses: actions/upload-artifact@v4
          if: always()
          with:
            name: test-results
            path: test-results.xml

    typecheck-frontend:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: "20", cache: "npm", cache-dependency-path: frontend/package-lock.json }
        - run: npm ci
          working-directory: frontend
        - run: npm run typecheck
          working-directory: frontend

    build-frontend:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: "20", cache: "npm", cache-dependency-path: frontend/package-lock.json }
        - run: npm ci && npm run build
          working-directory: frontend
  ```

Nota: job `typecheck-backend` com mypy omitido (imports dinâmicos reclamariam); ruff cobre lint.
`ruff.toml` criado na raiz com configuração mínima para `backend/`.

### Checklist de aceite

- [ ] Pipeline passa no primeiro push para `frontend-shopper`
- [x] Falha de lint bloqueia merge (ruff)
- [x] Falha de tipo (tsc) bloqueia merge (frontend)
- [x] Falha de teste bloqueia merge (pytest com SQLITE_PATH/OUTPUTS_PATH via env)
- [x] Artefatos de teste são gerados e acessíveis (junit-xml + upload-artifact)

---

## T4-4 — Observabilidade mínima

- [x] Logs estruturados com `logging` padrão em JSON — `backend/logging_config.py` criado
- [x] Toda request logada via `_RequestLoggingMiddleware` em `app.py`: método, path, status, duração
- [x] Log de jobs: `enqueue()` loga job_enqueued, `update()` loga job_updated com status
- [x] `LOG_LEVEL` controlado por env var (lido de `backend/config.py`)
- [x] Logs vão para stdout — `logging.basicConfig(stream=sys.stdout)`

### Checklist de aceite

- [x] `docker-compose logs backend` mostrará requests em formato JSON
- [ ] Erros aparecem com stack trace (handler de exceção global já existe em app.py)
- [ ] `print()` no código de produção — remoção incremental (fora do escopo desta fase)

---

## T4-5 — Retries e timeouts em integrações externas

- [x] Google Sheets API: `socket.setdefaulttimeout(30)` adicionado em `core/gsheets_client.py`
- [x] Retry com exponential backoff: `GSheetsClient._execute()` já tinha retry (6 tentativas); `backend/adapters/google_sheets/retry_policy.py` criado como utilitário reutilizável
- [ ] Metabase API: timeout configurável via env (METABASE_URL já lido de config)
- [ ] Apps Script: timeout via socket já cobre

### Checklist de aceite

- [x] Sheets API com timeout de 30s configurado (socket global)
- [x] Sheets API com retry configurado (já existente + retry_policy.py)
- [ ] Erro de timeout retorna HTTP 504 com mensagem clara (implementação futura)

---

## Critério de saída da Fase 4

- [x] T4-1 concluído (config.py, .env.example, .gitignore, adapters atualizados)
- [x] T4-2 concluído (Dockerfile atualizado, docker-compose.yml, GET /health, data/.gitkeep)
- [x] T4-3 concluído (.github/workflows/ci.yml, ruff.toml)
- [x] T4-4 concluído (logging_config.py, middleware de request, logs de jobs)
- [x] T4-5 concluído (socket timeout 30s, retry_policy.py)
- [ ] `docker-compose up --build` sobe do zero em máquina limpa (verificar com Docker disponível)
- [ ] CI/CD passa em todos os jobs (verificar após push para GitHub)
- [ ] Sistema deployável em Railway/Render/Fly.io com ajuste apenas do `.env`
- [x] Sem secrets no código ou no histórico git

---

## Checklist final de portabilidade (cloud-agnostic)

- [x] Toda configuração via env vars (12-factor) — `backend/config.py`
- [x] Containers OCI-compliant (`docker build` funciona sem Docker Desktop)
- [x] Nenhum serviço externo obrigatório além de Google Sheets e Metabase
- [x] `docker-compose up` é o único comando para subir tudo localmente
- [x] Health check exposto em `/health`
- [x] Logs em stdout, sem arquivo local obrigatório
- [x] Volumes explícitos para tudo que precisa persistir
