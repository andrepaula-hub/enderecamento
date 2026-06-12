# Contratos detalhados das rotas usadas pelo front

Rotas chamadas por `dse-data.js` (linhas 266–286). São as que não podem quebrar durante a refatoração.

---

## `POST /api/connectWorkflowSheets`

Conecta as três planilhas do workflow de uma vez.

**Request:**
```json
{ "args": ["https://docs.google.com/spreadsheets/d/TARGET_ID/...", "MASTER_ID_ou_link", "MIX_ID_ou_link"] }
```
`args[1]` e `args[2]` são opcionais — se omitidos, usa o que já está salvo.

**Response (sucesso):**
```json
{
  "success": true,
  "target": { "sheet_id": "abc123", "title": "Nome da planilha" },
  "master": { "sheet_id": "def456", "title": "Master" },
  "mix":    { "sheet_id": "ghi789", "title": "Mix" }
}
```

**Response (erro):**
```json
{ "success": false, "error": "ID de planilha inválido ou sem permissão de acesso." }
```

---

## `POST /api/getWorkflowSheets`

Retorna as planilhas atualmente conectadas.

**Request:** `{ "args": [] }` ou body vazio

**Response:**
```json
{
  "success": true,
  "target": { "sheet_id": "abc123", "title": "Endereçamento Pinheiros" },
  "master": { "sheet_id": "def456", "title": "Master" },
  "mix":    { "sheet_id": "ghi789", "title": "Mix" }
}
```
Campos podem ser `null` se ainda não conectados.

---

## `POST /api/getInitialData`

Carrega o estado completo do mapa (produtos, alocações, ruas, equipamentos).
É a rota mais pesada — lê múltiplas abas do Sheets.

**Request:** `{ "args": [] }` ou body vazio

**Response (sucesso):**
```json
{
  "content_html": "<table>...</table>",
  "all_products_json": "[{\"id\":\"SKU001\",\"nome\":\"Produto X\",...}]",
  "product_location_map_json": "{\"RUA-A-01-01\":{\"p1\":\"SKU001\"}}",
  "unallocated_products_json": "{\"SKU999\":{...}}",
  "all_products_data_map_json": "{\"SKU001\":{...}}",
  "equipTypesJson": "[{\"id\":\"E01\",\"type\":\"geladeira\",...}]",
  "metrics_panel_data_json": "{\"total_skus\":120,...}",
  "barcode_map_json": "{\"7891234\":\"SKU001\"}",
  "spreadsheet_title": "Endereçamento Pinheiros",
  "failed_products_section": "",
  "limite_peso_kg": 25
}
```

**Response (sem planilha):**
```json
{ "error": "Cole o link/ID da planilha no topo e clique em Conectar." }
```

---

## `POST /api/saveBatchMoves`

Salva lista de movimentos na planilha e registra no log do Card175.

**Request:**
```json
{
  "args": [
    [
      {
        "from": "RUA-A-01-01",
        "to": "RUA-B-02-03",
        "product_id": "SKU001",
        "slot": 1
      }
    ],
    { "skipFull": false }
  ]
}
```

**Response (sucesso):**
```json
{
  "success": true,
  "saved": 1,
  "card175LogsAdded": 1
}
```

**Response (erro):**
```json
{ "success": false, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro." }
```

---

## `POST /api/savePlanoVersion`

Salva snapshot da versão atual do plano de endereçamento.

**Request:**
```json
{ "args": ["nome opcional da versão"] }
```

**Response (sucesso):**
```json
{
  "success": true,
  "version_id": "v_20260612_143022",
  "name": "nome opcional da versão",
  "saved_at": "2026-06-12T14:30:22"
}
```

---

## `POST /api/listPlanoVersions`

**Request:** `{ "args": [] }` ou body vazio

**Response:**
```json
{
  "success": true,
  "versions": [
    { "id": "v_20260612_143022", "name": "...", "saved_at": "2026-06-12T14:30:22", "rows": 450 }
  ]
}
```

---

## `POST /api/restorePlanoVersion`

**Request:**
```json
{ "args": ["v_20260612_143022"] }
```

**Response (sucesso):**
```json
{ "success": true, "restored": "v_20260612_143022", "rows": 450 }
```

---

## `POST /api/getMapLoadStatus`

Verifica se a aba `Plano_Enderecamento_Final` existe e tem dados.

**Request:** `{ "args": [] }` ou body vazio

**Response:**
```json
{
  "success": true,
  "ready": true,
  "sheet_name": "Plano_Enderecamento_Final",
  "rows": 450
}
```

---

## `POST /api/runEtlToBaseProducts`

Executa o ETL completo. Faz ~12 chamadas ao Sheets API.
Demora entre 10–60s dependendo do tamanho das planilhas.

**Request:** `{ "args": [] }` ou body vazio

**Response (sucesso):**
```json
{
  "success": true,
  "products_written": 320,
  "warnings": [],
  "elapsed_seconds": 18.4
}
```

---

## `POST /api/generateKdabraSheet`

Gera aba KDABRA na planilha ativa.

**Request:** `{ "args": [] }` ou body vazio

**Response:**
```json
{ "success": true, "rows": 320 }
```

---

## `POST /api/generateLayoutAtual`

**Request:**
```json
{ "args": ["DePara", "Plano_Enderecamento_Final_Layout_Atual"] }
```
Ambos opcionais — usa defaults se omitidos.

**Response:**
```json
{ "success": true, "rows": 320 }
```

---

## `GET /api/download`

Sem body. Retorna o arquivo XLSX da planilha ativa como download.

**Response:** `FileResponse` com `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
