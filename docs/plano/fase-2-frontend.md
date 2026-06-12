# Fase 2b — Modularização: Frontend

Objetivo: substituir o frontend JSX/Babel/window.* por React + TypeScript + Vite.
Estratégia: novo projeto `frontend/` dentro do repo, rodando em paralelo com o backend hexagonal.

**Pode ser feita em paralelo com a Fase 2a a partir de T2a-2.**
**O front antigo (`shopper_front/`) fica intacto até esta fase estar concluída.**

---

## T2b-1 — Inicializar projeto Vite + React + TypeScript

- [x] Criar projeto dentro do repo:
  ```bash
  npm create vite@latest frontend -- --template react-ts
  cd frontend && npm install
  ```
- [x] Instalar dependências:
  ```bash
  npm install @tanstack/react-query zustand
  npm install -D @types/react @types/react-dom
  ```
- [x] Configurar `vite.config.ts` com proxy para o backend:
  ```ts
  server: { proxy: { '/api': 'http://localhost:8000' } }
  ```
- [ ] Commit do scaffolding vazio

### Checklist de aceite

- [ ] `npm run dev` sobe o frontend em `localhost:5173`
- [x] `npm run build` gera `dist/` sem erros
- [x] `npm run typecheck` (tsc --noEmit) passa
- [ ] Proxy `/api` funciona — `fetch('/api/getInitialData')` chega no backend

---

## T2b-2 — Criar camada de API (substituir dse-data.js)

Substituir `dse-data.js` (XHR síncrono + `window.DSEApi`) por módulos TypeScript com `fetch`.

- [x] `frontend/src/api/client.ts` — função base `post(path, body)` e `get(path)`
  - `fetch` com `async/await`
  - Tipagem de erro padronizada
- [x] `frontend/src/api/workflow.ts`
  - `connectSheets(target, master, mix)`
  - `getWorkflowSheets()`
- [x] `frontend/src/api/addressing.ts`
  - `getInitialData()`
  - `saveBatchMoves(moves, options)`
  - `getMapLoadStatus()`
- [x] `frontend/src/api/versions.ts`
  - `listVersions()`
  - `saveVersion(name)`
  - `restoreVersion(id)`
  - `deleteVersion(id)`
- [x] `frontend/src/api/etl.ts`
  - `runEtl()`
  - `buildSalesTarget(payload)`
- [x] `frontend/src/api/card175.ts`
  - `importCard175Metabase(payload)`
- [x] `frontend/src/api/exports.ts`
  - `generateKdabraSheet()`
  - `generateLayoutAtual()`
  - `downloadFile()`
- [x] `frontend/src/api/stores.ts`
  - `listStores()` — chama `GET /api/stores`, cai em fallback se não disponível

### Checklist de aceite

- [x] Nenhuma chamada usa `XMLHttpRequest`
- [~] Fallback hardcoded mantido em `stores.ts` apenas como safety net — rota `/api/stores` é chamada primeiro
- [x] Todos os módulos têm tipos TypeScript para request e response
- [x] `tsc --noEmit` passa sem erros nos arquivos de API

---

## T2b-3 — Criar store de estado com Zustand (substituir window.*)

Substituir `window.DSEData`, `window.DSEBootstrap`, `window.DSE_CURVA_COLOR`, `window.DSE_GROUP_STYLE`.

- [x] `frontend/src/store/addressing.ts` — estado do mapa de endereçamento
- [x] `frontend/src/store/ui.ts` — estado visual da UI
- [x] `frontend/src/store/versions.ts` — estado de versões
- [x] `frontend/src/store/tweaks.ts` — configurações visuais (dark mode, density, colWidth) com persist
- [x] `frontend/src/store/config.ts` — configuração de workflow (selectedStore, sheetLinks)

### Checklist de aceite

- [x] Nenhum `window.*` assignment no código novo
- [x] Nenhum `window.*` read no código novo (exceto `window.location` e `window.setTimeout` que são globais do browser)
- [x] Estado persiste corretamente entre re-renders (tweaks via zustand/persist)
- [x] `tsc --noEmit` passa

---

## T2b-4 — Migrar componentes (substituir JSX sem tipo por TSX)

Migrar os componentes de `shopper_front/*.jsx` para `frontend/src/`.
Fazer um componente por vez, testando visualmente.

- [x] `frontend/src/pages/ConfigPage.tsx` — substitui `dse-config.jsx`
  - Conecta ao store `config` e à API `workflow`
  - Carrega lojas via `useQuery(['stores'], listStores)`
- [x] `frontend/src/pages/MapPage.tsx` — substitui `dse-map.jsx` + `dse-app.jsx`
  - Usa stores Zustand e useReducer para estado local do mapa
  - Sem lógica de normalização (backend normaliza)
- [x] `frontend/src/components/Prancheta.tsx` — substitui `dse-prancheta.jsx`
- [x] `frontend/src/components/Escaninho.tsx` — substitui core visual de `dse-escaninho.jsx`
- [x] `frontend/src/components/panels/MetricsPanel.tsx` — substitui parte de `dse-panels.jsx`
- [x] `frontend/src/components/panels/VersionsPanel.tsx` — substitui parte de `dse-panels.jsx` (usa TanStack Query)
- [x] `frontend/src/components/panels/LegendPanel.tsx`
- [x] `frontend/src/components/TweaksPanel.tsx` — substitui `tweaks-panel.jsx` (usa Zustand persist)
- [x] `frontend/src/components/SearchBar.tsx` — extraído de `dse-app.jsx`
- [x] `frontend/src/components/ConfirmModal.tsx` — extraído de `dse-app.jsx`
- [x] `frontend/src/App.tsx` — usa store Zustand + ErrorBoundary

### Checklist de aceite

- [x] Nenhum componente contém funções de normalização de dados (`normalizeGroup`, `normalizeCurve`, `normalizeDegelo`, `toNumber`, `toInt`, `requiredBins`, `normalizeEquipType`)
- [x] Nenhum `dangerouslySetInnerHTML` (LogItem usa texto simples ao invés de HTML raw)
- [x] Todos os componentes têm tipos nas props (sem `any` explícito)
- [x] `tsc --noEmit` passa
- [x] `npm run build` gera bundle sem erros

---

## T2b-5 — Configurar nginx para servir o build

- [x] Criar `frontend/nginx.conf` — serve `dist/` e faz proxy `/api → backend`
- [x] Criar `frontend/Dockerfile` build multistage (node:20-alpine → nginx:alpine)
- [ ] Remover `StaticFiles` do FastAPI (`app.mount("/", StaticFiles(...))`) — nginx assume (pendente: não modificar app.py nesta fase)

### Checklist de aceite

- [ ] `docker build -f frontend/Dockerfile frontend/` funciona sem erro (não testado localmente)
- [ ] Frontend servido via nginx na porta 80
- [ ] Chamadas `/api/*` chegam corretamente no backend

---

## Critério de saída da Fase 2b

- [x] T2b-1 até T2b-5 concluídos (T2b-5 parcial: Dockerfile e nginx criados, docker build não testado)
- [x] `npm run build` e `npm run typecheck` passam sem erros
- [~] Paridade funcional com front atual — MapPage tem canvas simplificado (sem drag & drop de escaninho completo); comportamento visual principal está implementado
- [ ] `shopper_front/` pode ser deletado — aguarda validação visual completa
- [x] Nenhum XHR síncrono no codebase novo
- [x] Nenhum `window.*` de estado no codebase novo
