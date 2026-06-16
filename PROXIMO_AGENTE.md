# Handoff: Conectar backend de alocação ao frontend

## Contexto

Leia o `CLAUDE.md` na raiz do repo antes de qualquer coisa. Ele tem tudo sobre o projeto.

O app roda em `localhost:8000` (Docker, FastAPI + JSX Babel Standalone).  
Branch de trabalho: `frontend-shopper`.

## O que precisa ser feito

### Objetivo principal

Fazer o Cmd+click (fill de equipamento) chamar o endpoint backend `POST /api/addressing/suggest`
em vez de usar o `scoreSlotForProduct` implementado localmente em JS no `dse-map.jsx`.

O Python (`core/agent_scoring.py`) já tem a lógica completa e correta.  
O endpoint já existe e funciona (`backend/entrypoints/api/routes.py` linha ~249).  
O `suggest_allocations.py` já conecta o endpoint ao engine.

O que falta: o frontend não chama esse endpoint.

---

## Como funciona o fill hoje

Em `shopper_front/dse-map.jsx`:

1. `handleEscClick` detecta Cmd+click → `scope = 'equipment'`
2. Chama `buildAllocationBatch(escsId, { scope: 'equipment', slot: 1 })`
3. `buildAllocationBatch` lista escaninhos candidatos, filtra vazios, e usa `scoreSlotForProduct` (JS local) para ordenar
4. Retorna array de `{ escaninhoId, productId, slot }`
5. Chama `onAllocateMany(batch)` que aplica as alocações no estado local

---

## O que mudar

### Opção recomendada: trocar `buildAllocationBatch` para async + chamada ao backend

Quando `scope === 'equipment'` e há múltiplos produtos na fila:

```javascript
// Em buildAllocationBatch (ou num novo handleSmartFill), ao invés de:
const best = [...targets].sort((a, b) => scoreSlotForProduct(b, productId) - scoreSlotForProduct(a, productId))[0];

// Chamar:
const response = await fetch('/api/addressing/suggest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    unallocated_codes: queueProductIds.map(id => {
      const m = String(id).match(/^(?:unallocated|collected)::(.+?)::\d+$/);
      return m ? m[1] : id;
    }),
    products_data: Object.values(window.DSEData.PRODUCT_MAP),
    map_structure: mapStructure,
    allocations: allocations,
    options: {}
  })
});
const result = await response.json();
// result.moves = [{escaninhoId, productCode, slot}]
```

O retorno do backend é:
```json
{
  "success": true,
  "moves": [{"escaninhoId": "R1-E5-3-2", "productCode": "ABC123", "slot": 1}],
  "unallocated": ["XYZ789"],
  "summary": {"total_requested": 10, "proposed": 9, "unallocated": 1}
}
```

Atenção: `moves[i].productCode` é o código puro. Você precisa mapear de volta para o `boardEntryId`
(formato `unallocated::CODIGO::N`) para chamar `onAllocate`/`onAllocateMany` corretamente.
O `queueProductIds` tem os `boardEntryId`s — crie um mapa `codigo → boardEntryId` antes de chamar o endpoint.

### Como o `handleEscClick` precisa mudar

`buildAllocationBatch` é síncrono hoje. Se tornar a chamada async, precisa:
- Tornar `handleEscClick` async também, ou
- Criar um `handleSmartFill` separado que é chamado apenas quando `scope === 'equipment'` com múltiplos produtos

A segunda abordagem tem menos risco de quebrar o comportamento de click único.

---

## Bugs adicionais a corrigir (depois do principal)

### 1. Regra de ovos no JS (se mantiver fallback JS)
Em `scoreSlotForProduct`, adicionar:
```javascript
const isEgg = (product.nome || '').toLowerCase().startsWith('ovo');
if (isEgg) {
  if (level < 2 || level > 4) return -99999;
}
```

### 2. Nomes de equipamentos hardcodados
`dse-data.js`, função `parseEquipId(ruaNum, equipNum)`:  
Hoje reconstrói `'R' + ruaNum + '-E' + equipNum` sempre.  
Fix: ler o atributo `id` real do elemento HTML do equipamento em vez de reconstruir.  
Após isso, rodar o ETL (botão "Rodar ETL" no app) para gerar os IDs novos.

---

## Armadilhas conhecidas

### Babel Standalone e cache
O `shopper_front/` compila JSX no browser. O cache do Babel é keyed pela URL do script.
O servidor já injeta `?v=<mtime>` nas URLs — então qualquer mudança num `.jsx` troca o mtime e o cache invalida automaticamente.  
**Mas**: isso só funciona se o arquivo foi de fato alterado no container.

```bash
# Atualizar arquivo no container sem rebuild completo:
docker cp shopper_front/dse-map.jsx enderecamento_backend:/app/shopper_front/dse-map.jsx

# Verificar que a versão mudou:
curl -s http://localhost:8000/ | grep dse-map.jsx
```

### boardEntryId vs productCode
`queueProductIds` contém `"unallocated::CODIGO::123"`, não códigos puros.  
PRODUCT_MAP é indexado por código puro.  
Sempre extrair com: `raw.match(/^(?:unallocated|collected)::(.+?)::\d+$/)`

### Docker rebuild vs recreate
- `docker compose up -d --build --force-recreate` reconstrói e recria o container
- `--force-recreate` sozinho sem `--build` não rebusca o build cache
- Para mudanças em código Python, é preciso rebuild. Para JSX, `docker cp` é suficiente.

---

## Regra de ouro

**Não declare que está funcionando sem testar no app rodando em `localhost:8000`.**

Teste assim:
1. `docker cp` o arquivo alterado para o container
2. Recarregar `localhost:8000`
3. Cmd+click num equipamento com vários produtos na fila
4. Verificar no DevTools (aba Network) se a requisição `POST /api/addressing/suggest` foi feita
5. Verificar se os produtos pesados foram para os níveis do meio
6. Verificar se FLV não foi para o primeiro ou último nível
7. Verificar no console do browser se há erros

Só após isso commitar.
