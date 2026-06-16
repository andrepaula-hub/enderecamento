# Projeto Endereçamento — Contexto para Agentes

## Repositório

- GitHub: `https://github.com/AndreLobo1/enderecamento-local-20260609`
- Branch de desenvolvimento: `frontend-shopper`
- Branch estável: `main` (versão antiga, funcional mas lenta — toda lógica rodava no front)

## Onde o app roda

**SEMPRE use `localhost:8000`**, servido por FastAPI dentro do Docker.

- `localhost:8000` → FastAPI + `shopper_front/` (JSX com Babel Standalone)
- `localhost:80` → nginx + `frontend/` (React/Vite/TypeScript) — **NÃO É USADO pelo usuário**

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
  agent_scoring.py              # ENGINE de scoring/alocação (regras físico-pesado/FLV/ovos/frágil)
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
  dse-map.jsx                   # Mapa principal, lógica de fill/alocação
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
- `scoreSlotForProduct` em JS com regras pesado/FLV/frágil/pequeno
- Extração correta do código do produto de `boardEntryId`
- Endpoint backend `POST /api/addressing/suggest` (usa `suggest_allocations.py` → `agent_scoring.py`)

### Bugs conhecidos ainda não resolvidos

1. **Ordem greedy (crítico)**: O fill atual processa produtos na ordem da fila (alfabética). Produtos mais restritos (pesado, ovos) chegam depois e não encontram slots disponíveis nos níveis certos.
   - Fix: ordenar por "mais restrito primeiro" antes do greedy (`_sort_products_for_allocation` já existe em `agent_scoring.py`)

2. **Regra de ovos ausente no JS**: `scoreSlotForProduct` em `dse-map.jsx` não implementa a regra de ovos (níveis 2–4).

3. **nomes dos equipamentos hardcodados**: `dse-data.js` `parseEquipId()` sempre reconstrói `R{rua}-E{equip}` ignorando o ID real do HTML.

### Lacuna arquitetural principal

A lógica de alocação existe em dois lugares:
- **`core/agent_scoring.py`** (backend Python, completo e correto)
- **`scoreSlotForProduct` em `dse-map.jsx`** (reimplementação parcial em JS, com bugs)

O endpoint `POST /api/addressing/suggest` já chama o Python correto, mas o frontend **não o chama**.
`buildAllocationBatch` em `dse-map.jsx` ainda usa `scoreSlotForProduct` JS localmente.

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
