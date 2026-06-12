# Contratos de Rotas — AS-IS

Todas as rotas usam `POST` com body `{ "args": [...] }` (padrão `ScriptRequest`),
exceto as marcadas com `GET`.

Gerado a partir de `app.py`. Última atualização: 2026-06-12.

---

## Mapa de rotas → casos de uso

| Método | Rota | Caso de uso | Módulo futuro | Usado pelo front? |
|--------|------|-------------|---------------|-------------------|
| GET | `/` | Serve index.html | entrypoints | — |
| GET | `/api/download` | Exporta planilha ativa como XLSX | exports | sim |
| GET | `/api/file` | Serve arquivo por path | exports | sim |
| POST | `/api/connectSheet` | Conecta planilha de endereçamento | workflow | sim |
| POST | `/api/connectMasterSheet` | Conecta planilha master | workflow | sim |
| POST | `/api/connectMixSheet` | Conecta planilha de mix | workflow | sim |
| POST | `/api/connectWorkflowSheets` | Conecta target + master + mix de uma vez | workflow | sim |
| POST | `/api/getWorkflowSheets` | Retorna planilhas conectadas | workflow | sim |
| POST | `/api/getActiveSheet` | Retorna planilha ativa | workflow | sim |
| POST | `/api/getMapLoadStatus` | Verifica se Plano_Enderecamento_Final tem dados | addressing | sim |
| POST | `/api/getInitialData` | Carrega estado completo do mapa | addressing | sim |
| POST | `/api/saveBatchMoves` | Salva lista de movimentos no Sheets | addressing | sim |
| POST | `/api/saveSingleMove` | Salva um movimento no Sheets | addressing | sim |
| POST | `/api/executeSwap` | Troca dois produtos de posição | addressing | sim |
| POST | `/api/executeEquipmentSwap` | Troca dois equipamentos de posição | addressing | sim |
| POST | `/api/generateLayoutAtual` | Gera aba de layout atual no Sheets | exports | sim |
| POST | `/api/generateKdabraSheet` | Gera planilha KDABRA | exports | sim |
| POST | `/api/generateKdabraEnderecarSheet` | Gera planilha KDABRA Endereçar | exports | sim |
| POST | `/api/savePlanoVersion` | Salva snapshot de versão | versioning | sim |
| POST | `/api/listPlanoVersions` | Lista versões salvas | versioning | sim |
| POST | `/api/restorePlanoVersion` | Restaura versão pelo ID | versioning | sim |
| POST | `/api/deletePlanoVersion` | Remove versão pelo ID | versioning | sim |
| POST | `/api/changeEquipmentType` | Altera tipo de equipamento | addressing | não (FRONT_LIMITACOES) |
| POST | `/api/createNewEquipment` | Cria novo equipamento | addressing | não |
| POST | `/api/deleteEquipmentAndProducts` | Remove equipamento e seus produtos | addressing | não |
| POST | `/api/generateSlotsFromCadastro` | Gera escaninhos a partir do cadastro | addressing | sim |
| POST | `/api/runEtlToBaseProducts` | Executa ETL completo de produtos | catalog_etl | sim |
| POST | `/api/buildMetabaseSalesTarget` | Gera vendas-alvo via Metabase | sales_target | sim |
| POST | `/api/exportMetabaseSalesXlsx` | Exporta vendas-alvo como XLSX | sales_target | sim |
| POST | `/api/importCard175Snapshot` | Importa Card175 por upload de arquivo | card175 | não |
| POST | `/api/importCard175Metabase` | Importa Card175 via Metabase | card175 | sim |
| POST | `/api/getEtlMappingOptions` | Lista opções de mapeamento ETL | catalog_etl | não |
| POST | `/api/saveEtlWarningMappings` | Salva mapeamentos de warnings ETL | catalog_etl | não |
| POST | `/api/sendEtlWarningGroup` | Envia grupo de warning para ETL | catalog_etl | não |
| POST | `/api/sendMissingVolumetriaDefault` | Envia default p/ volumetria ausente | catalog_etl | não |
| POST | `/api/refreshEtlWarning` | Recarrega warning ETL específico | catalog_etl | não |
| POST | `/api/sanitizeMixDuplicates` | Remove duplicatas do mix | catalog_etl | não |
| POST | `/api/addNewProduct` | Cadastra produto novo na base | catalog_etl | não |
| POST | `/api/updateBaseProduct` | Atualiza produto da base | catalog_etl | não |
| POST | `/api/generateSkuReportCustom` | Gera relatório de SKU customizado | exports | não |
| POST | `/api/exportFilteredUnallocatedXlsx` | Exporta não-alocados filtrados | exports | não |
| POST | `/api/getProductByBarcode` | Busca produto por código de barras | addressing | não |
| POST | `/api/removeAllProductsByFilter` | Remove produtos em massa por filtro | addressing | não |
| POST | `/api/previewRemoveAllProductsByFilter` | Prévia da remoção em massa | addressing | não |
| POST | `/api/agent/inferStoreContext` | Infere contexto da loja | workflow | não |
| POST | `/api/agent/prepareWorkflow` | Prepara workflow do agente | workflow | não |
| POST | `/api/agent/validatePlan` | Valida plano automático | addressing | não |
| POST | `/api/agent/autoAddressPreview` | Prévia de auto-endereçamento | addressing | não |
| POST | `/api/agent/applyAutoAddress` | Aplica auto-endereçamento | addressing | não |

---

## Padrão de request

Todas as rotas POST usam o mesmo modelo:

```json
{ "args": [arg1, arg2, ...] }
```

Não há autenticação. O servidor espera rodar localmente.

## Padrão de response

Sucesso:
```json
{ "success": true, ...dados }
```

Erro:
```json
{ "success": false, "error": "mensagem descritiva" }
```

Sem planilha ativa:
```json
{ "error": "Cole o link/ID da planilha no topo e clique em Conectar." }
```
ou
```json
{ "success": false, "error": "Nenhuma planilha ativa. Conecte uma planilha primeiro." }
```
