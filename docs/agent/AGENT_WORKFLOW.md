# Workflow do Agente de Enderecamento

Status: rascunho tecnico-operacional.

## Objetivo

Automatizar o fluxo que hoje e feito manualmente no site local, usando os recursos ja existentes do backend e migrando o preenchimento automatico do frontend para uma API chamavel por agente.

## Principio

O agente nao deve "clicar a loja inteira" escaninho por escaninho como estrategia principal. Ele deve chamar ferramentas deterministicas do backend, revisar resultados e pedir decisao quando o plano exigir tradeoff operacional.

## Responsabilidade de Aplicacao

Quando o usuario pedir uma mudanca no site/app de enderecamento, o agente e responsavel por aplicar a mudanca ate o ambiente em uso. Isso inclui identificar qual workspace/container esta servindo a tela aberta, reiniciar ou rebuildar o servidor necessario, recarregar caches quando aplicavel e validar que a versao nova esta respondendo antes de encerrar.

## Entradas que o Agente Deve Pedir

- Janela de vendas.
- Escopo do enderecamento: loja toda, geladeiras, prateleiras, freezers, rua ou equipamentos.
- Link da planilha de enderecamento.
- Link da planilha de mix.
- Identificacao dos equipamentos afastados para quimicos, quando quimicos existirem e o layout nao estiver disponivel.
- Layout/imagem da loja, se o usuario preferir que o agente analise distancia fisica.
- Se nao houver isolamento para quimicos, autorizacao para usar buffer com perfumaria/neutros.

## Entradas que o Agente Nao Deve Pedir

- Loja manualmente. Se algum parametro interno de vendas/Metabase precisar de loja, ele deve ser inferido pela planilha ou pelo conteudo; isso nao deve virar pergunta operacional.
- Link da ETL mae, pois e fixo.
- Modelo de planilha por loja, pois mix e enderecamento ja chegam prontos no modelo.

## Fluxo Padrao

1. Coletar janela de vendas, escopo, link de enderecamento e link de mix.
2. Conectar planilha de enderecamento.
3. Conectar ETL mae fixa.
4. Conectar mix informado.
5. Inferir internamente parametros de vendas/Metabase quando necessario, sem perguntar loja.
6. Montar `Vendas Alvo` para a janela informada.
7. Rodar ETL para atualizar `Base_Produtos`.
8. Validar pendencias de ETL e dados essenciais.
   - Se `grupo`, `categoria_armazenagem` ou `escaninhos_necessarios` estiverem vazios, parar e reportar bloqueio de dados.
9. Verificar se `Plano_Enderecamento_Final` existe e tem slots.
10. Se necessario, gerar slots a partir de `Cadastro_Equipamentos`.
11. Rodar planejamento de capacidade.
12. Se quimicos existirem, validar se ha equipamentos/zona de quimicos definida.
    - Se nao houver zona isolada, perguntar se pode usar estrategia de buffer: quimicos no miolo e perfumaria/neutros nas pontas/contatos.
13. Rodar autoenderecamento em `dry_run`.
14. Validar regras duras e condicionadas.
15. Apresentar resumo de previa.
16. Aguardar aprovacao se houver decisao condicionada.
17. Aplicar plano.
18. Salvar versao.
19. Exportar KDABRA somente se o usuario pedir.

## Estados de Parada

O agente deve parar antes de aplicar quando:

- faltar dado essencial;
- o ETL falhar ou nao tiver sido executado com sucesso para a planilha ativa;
- o agente detectar grupo/categoria/escaninhos ausentes apos o ETL;
- faltar capacidade sem usar fallback;
- for necessario usar dois produtos por endereco;
- for necessario usar nivel mais alto;
- for necessario relaxar isolamento de quimicos;
- nao houver identificacao/layout para definir equipamentos afastados de quimicos;
- houver incompatibilidade de categoria de armazenagem com equipamentos disponiveis;
- houver produtos que exigem equipamento inexistente ou insuficiente.

## Decisoes Condicionadas que Exigem Aprovacao

- Usar nivel mais alto.
- Usar dois produtos por endereco.
- Usar volumetria padrao.
- Relaxar regra de continuidade de produto multi-escaninho.
- Misturar quimicos fora da zona isolada.
- Adicionar, deletar ou alterar tipo de equipamento.

## Ferramentas Backend Existentes

Endpoints ja existentes que o agente pode usar:

- `/api/connectSheet`
- `/api/connectMasterSheet`
- `/api/connectMixSheet`
- `/api/connectWorkflowSheets`
- `/api/getWorkflowSheets`
- `/api/getMapLoadStatus`
- `/api/getInitialData`
- `/api/buildMetabaseSalesTarget`
- `/api/runEtlToBaseProducts`
- `/api/generateSlotsFromCadastro`
- `/api/saveBatchMoves`
- `/api/saveSingleMove`
- `/api/executeSwap`
- `/api/executeEquipmentSwap`
- `/api/changeEquipmentType`
- `/api/createNewEquipment`
- `/api/deleteEquipmentAndProducts`
- `/api/savePlanoVersion`
- `/api/generateKdabraEnderecarSheet`
- `/api/generateKdabraSheet`

## Ferramentas Backend do Agente

Endpoints adicionados para o agente trabalhar sem depender da interface:

- `/api/agent/prepareWorkflow`
  - conecta enderecamento, ETL mae fixa e mix;
  - infere parametros internos de vendas/Metabase quando necessario;
  - monta `Vendas Alvo` quando recebe janela de vendas;
  - roda ETL;
  - gera escaninhos se `Plano_Enderecamento_Final` ainda nao estiver pronto.
- `/api/agent/inferStoreContext`
  - retorna titulo da planilha, nome de loja inferido e `sheet_id`.
- `/api/agent/autoAddressPreview`
  - gera movimentos em memoria, sem gravar.
  - aceita escopo combinado, por exemplo rua + tipo de equipamento: `{"type":"store","ruas":[1],"equipment_types":["prateleira"]}`.
- `/api/agent/applyAutoAddress`
  - aplica movimentos aprovados via `saveBatchMoves`;
  - opcionalmente salva versao e exporta KDABRA.
- `/api/agent/validatePlan`
  - valida plano atual contra regras duras ja portadas para backend.

Configuracao da ETL mae fixa:

- Preferencial: `ENDERECAMENTO_MASTER_SHEET`
- Alternativas aceitas: `ETL_MASTER_SHEET` ou `AGENT_ETL_MASTER_SHEET`

## Regra Arquitetural Obrigatoria

Nao deve existir diferenca entre algoritmos/motores de alocacao. Toda acao que escolha escaninhos deve consumir uma unica fonte da verdade: o motor backend em `core/agent_scoring.py`, exposto por use cases/endpoints em `backend/application/addressing/` e `backend/entrypoints/api/routes.py`.

O frontend atual (`shopper_front/`, servido por `localhost:8000`) deve somente enviar intencao, filtros, escopo e opcoes para o backend. Qualquer scoring/greedy local em JS e legado tecnico a remover.

## Lacuna Tecnica Principal

A primeira versao backend ja faz previa, validacao dura e aplicacao de movimentos, mas ainda precisa evoluir para reproduzir ou substituir totalmente:

- score completo de adjacencia;
- sparse fill;
- lookahead;
- reparo por swap;
- estrategia fina de segundo slot por baixa volumetria;
- leitura/analise de layout para quimicos.

## Endpoints Novos Recomendados

### `POST /api/agent/autoAddressPreview`

Gera plano em memoria, sem gravar.

Payload sugerido:

```json
{
  "sales_window": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"},
  "scope": {"type": "store"},
  "rules_profile": "default",
  "allow_top_level": false,
  "allow_second_slot": false,
  "chemical_zone": {
    "mode": "equipment_ids",
    "equipment_ids": ["R1-E1", "R1-E2"]
  }
}
```

Resposta sugerida:

```json
{
  "success": true,
  "dry_run": true,
  "summary": {
    "allocated": 0,
    "unallocated": 0,
    "hard_violations": 0,
    "conditional_decisions": []
  },
  "proposed_moves": [],
  "warnings": []
}
```

### `POST /api/agent/applyAutoAddress`

Aplica uma previa aprovada.

### `POST /api/agent/validatePlan`

Valida plano atual contra regras duras/condicionadas.

### `POST /api/agent/inferStoreContext`

Infere loja/metadados a partir da planilha de enderecamento conectada.

## Permissao do Agente para Alterar Codigo

Padrao recomendado:

- O agente pode alterar documentos e regras versionadas.
- O agente pode implementar endpoints e testes quando solicitado.
- O agente nao deve alterar pesos/regras do algoritmo em producao sem explicitar mudanca e rodar validacao.
- O agente nao deve aplicar mudanca de plano sem previa e aprovacao quando houver decisao condicionada.

## Sobre ChatGPT, Codex e MCP

Enquanto o site estiver local, o fluxo funciona melhor no Codex ou em qualquer ambiente que tenha acesso ao `localhost:8000` e aos arquivos/credenciais locais.

Para usar via ChatGPT normal com robustez, ha duas opcoes:

- hospedar a API do enderecamento em um servidor acessivel; ou
- criar um MCP/conector custom que exponha as ferramentas do backend local.

Um MCP custom faria sentido se a API continuar local e voce quiser que um agente externo chame funcoes como `run_etl`, `preview_auto_address` e `apply_plan` sem operar navegador.

Mesmo com MCP, se tudo estiver local, algum computador/servidor com o backend rodando precisa estar ligado.
