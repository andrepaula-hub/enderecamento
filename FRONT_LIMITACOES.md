# Limitações e funcionalidades fora do novo front

Este branch segue o front de `Enderecamento 2` como referência visual.

## Funcionalidades do backend atual que não ganharam botão/tela neste front

- Preparar workflow do agente: `/api/agent/prepareWorkflow`
- Validar plano automático: `/api/agent/validatePlan`
- Prévia/aplicação de autoendereçamento: `/api/agent/autoAddressPreview`, `/api/agent/applyAutoAddress`
- Importar Card 175 por arquivo: `/api/importCard175Snapshot`
- Alertas ETL detalhados: `/api/getEtlMappingOptions`, `/api/saveEtlWarningMappings`, `/api/sendEtlWarningGroup`, `/api/sendMissingVolumetriaDefault`, `/api/refreshEtlWarning`
- Sanitização de duplicados do mix: `/api/sanitizeMixDuplicates`
- Cadastro/edição direta de produto base: `/api/addNewProduct`, `/api/updateBaseProduct`
- Relatórios adicionais: `/api/generateSkuReportCustom`, `/api/exportFilteredUnallocatedXlsx`
- Busca por código de barras: `/api/getProductByBarcode`
- Remoção em massa por filtro: `/api/previewRemoveAllProductsByFilter`, `/api/removeAllProductsByFilter`

## Controles do mock novo que ficaram sem persistência segura neste branch

- Adicionar rua
- Remover rua
- Renomear equipamento
- Alterar tipo de equipamento
- Criar/remover equipamento pela UI do mock

Esses itens existem conceitualmente no mock, mas não foram ligados nesta variante para evitar inventar comportamento diferente do backend atual ou gravar estrutura de forma inconsistente.
