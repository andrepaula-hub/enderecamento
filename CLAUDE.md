# Projeto Endereçamento — Contexto para Agentes

## Repositório

- GitHub canonico: `https://github.com/andrepaula-hub/enderecamento.git`
- Branch de desenvolvimento: `frontend-shopper`
- Branch estável: `main` (versão antiga, funcional mas lenta — toda lógica rodava no front)

## Onde o app roda

**SEMPRE use `localhost:8000`**, servido por FastAPI dentro do Docker.

- `localhost:8000` → FastAPI + `shopper_front/` (JSX com Babel Standalone)
- `localhost:80` → nginx + `frontend/` (React/Vite/TypeScript) — **NÃO É USADO pelo usuário**
- `Dahsboard.html` → legado. **NAO e servido por este app e nao deve ser editado para pedidos sobre o print.**

```bash
# Subir o app
docker compose up -d --build

# Atualizar arquivo sem rebuild (mais rápido para iteração)
docker cp shopper_front/dse-map.jsx enderecamento_backend:/app/shopper_front/dse-map.jsx
```

## Estrutura do projeto

```
app.py                          # Entry point FastAPI
routes/
  connection.py                 # GET / com cache-busting JSX, /api/connectSheet etc.
  moves.py                      # /api/saveMoves, /api/getMap
  equipment.py                  # /api/equipment
  etl.py                        # /api/runEtl
  agent.py                      # /api/agent
core/
  agent_scoring.py              # FONTE UNICA do motor de scoring/alocacao
  initial_data.py               # ETL: lê planilha → devolve produtos, mapa, etc.
  gsheets_backend.py
backend/
  application/
    addressing/
      suggest_allocations.py    # Use case que chama core/agent_scoring.py — JÁ IMPLEMENTADO
      load_state.py
      save_moves.py
  entrypoints/api/routes.py     # Endpoint POST /api/addressing/suggest — JÁ EXISTE
  domain/                       # Entidades (product, equipment, slot, allocation, move...)
  adapters/                     # google_sheets, sqlite, filesystem
shopper_front/                  # Interface JSX (Babel Standalone — é o que o usuário usa)
  index.html
  dse-map.jsx                   # Mapa principal; deve enviar intencao/escopo ao backend, nao calcular scoring
  dse-prancheta.jsx             # Sidebar (Prancheta) com lista de produtos e filtros
  dse-data.js                   # Parseia HTML → PRODUCT_MAP, mapStructure, queueProductIds
  dse-styles.css
frontend/                       # React/Vite/TypeScript — NÃO USADO pelo usuário
```

## Babel Standalone — Armadilha de Cache

O `shopper_front/` usa Babel Standalone (compilação JSX no browser). O Babel cacheia código compilado **pela URL do script**. Se o conteúdo do arquivo mudar mas a URL for igual, o browser executa o código antigo.

**Solução implementada** em `routes/connection.py`:
- O `GET /` injeta `?v=<max_mtime_dos_jsx>` em todas as tags `<script src="...jsx">` do HTML
- Isso muda a URL → Babel recompila → novo código executa
- Para verificar: `curl -s http://localhost:8000/ | grep dse-map.jsx` deve mostrar `?v=17XXXXXXXX`

## Formato dos IDs

### escaninhoId (slot)
Formato: `{equipId}-{nivel}-{posicao}` → ex: `R1-E5-3-2`

### equipId
Atualmente o `dse-data.js` ainda usa `parseEquipId` que **hardcoda** `R{rua}-E{equip}` (ex: `R1-E5`).
O backend em `core/initial_data.py` foi alterado para gerar `R1-001`, mas:
- O ETL não foi rerodado
- `dse-data.js` ainda reconstrói com o formato antigo

**Consequência**: os nomes dos equipamentos na UI ainda aparecem como `R1-E5` em vez do nome real da planilha.

### boardEntryId (fila de produtos)
`queueProductIds` contém entradas no formato `unallocated::CODIGO::123`.
Para buscar no `PRODUCT_MAP` é preciso extrair o código:
```javascript
const m = raw.match(/^(?:unallocated|collected)::(.+?)::\d+$/);
const productCode = m ? m[1] : raw;
const product = window.DSEData.PRODUCT_MAP[productCode];
```

## Regras de alocação (`core/agent_scoring.py`)

## Arquitetura obrigatoria do motor de alocacao

Toda acao de alocacao que envolva algoritmo, score, escolha de slot, validacao de regra ou preenchimento em massa deve consumir uma unica fonte da verdade:

- fonte canonica: `core/agent_scoring.py`;
- use cases/API: `backend/application/addressing/` e endpoints em `backend/entrypoints/api/routes.py`;
- frontend: apenas coleta intencao, filtros, escopo e opcoes; renderiza resultado e validacoes.

E proibido criar ou manter motores paralelos no frontend. Codigo JS como `scoreSlotForProduct`/greedy local em `shopper_front/dse-map.jsx` deve ser tratado como legado tecnico a remover. A regra operacional e: equipamento, nivel, coluna vertical, rua e loja inteira devem chamar o mesmo motor backend com escopo diferente.

| Condição | Regra |
|----------|-------|
| `is_pesado` (>2kg) | Proibido no nível 1. Preferência: nível 4 (+70pts), nível 3 (+50pts) |
| `grupo == FLV` + prateleira | Proibido no nível 1 e no último nível |
| Ovos (nome começa com "ovo"/"ovos") | Apenas níveis 2–4 |
| `is_fragil` ou `alto` | Preferência pelo nível mais alto (topo) |
| `pequeno` | Preferência pelo nível mais baixo |

## Estado atual das features

### Implementado e funcionando
- Cmd+click → preenche do nível clicado pra baixo (scope=equipment)
- Shift+click → preenche o nível inteiro (scope=level)
- Filtro Equipamento na Prancheta usa `p.arm` (categoria_armazenagem), não `p.metodo`
- Cache-busting Babel via `?v=mtime`
- Extração correta do código do produto de `boardEntryId`
- Endpoint backend `POST /api/addressing/suggest` (usa `suggest_allocations.py` → `agent_scoring.py`)

### Bugs conhecidos ainda não resolvidos

1. **Motor JS local legado (crítico)**: qualquer acao que ainda use `scoreSlotForProduct`/greedy local em `shopper_front/dse-map.jsx` esta fora da arquitetura alvo. Deve migrar para o backend.

2. **nomes dos equipamentos hardcodados**: `dse-data.js` `parseEquipId()` sempre reconstrói `R{rua}-E{equip}` ignorando o ID real do HTML.

### Lacuna arquitetural principal

Migrar qualquer acao restante de alocacao do frontend para os endpoints backend, mantendo `core/agent_scoring.py` como unica fonte da verdade.

**O trabalho pendente é**: fazer `buildAllocationBatch` chamar o endpoint backend em vez de calcular localmente.

## Como testar após mudanças

1. `docker cp shopper_front/dse-map.jsx enderecamento_backend:/app/shopper_front/dse-map.jsx`
2. Recarregar `localhost:8000` (o `?v=mtime` muda, Babel recompila)
3. Abrir DevTools console para erros
4. Cmd+click em um equipamento para testar o fill
5. Verificar no console: `window.DSEData.PRODUCT_MAP` existe? Os produtos têm campos corretos?

## Variáveis globais disponíveis no browser

```javascript
window.DSEData.PRODUCT_MAP        // {codigo: {id, nome, pesado, fragil, arm, grupo, ...}}
window.DSEData.mapStructure       // [{id, equipment: [{id, tipo, niveis, escsPerNivel}]}]
window.DSEData.queueProductIds    // ["unallocated::CODIGO::N", ...]
window.DSEData.allocations        // {escaninhoId: {p1, p2}}
```
