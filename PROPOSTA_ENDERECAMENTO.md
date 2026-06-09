# Proposta opinativa para endereçamento, reendereçamento e governança contínua (dark stores)

Data: 11/03/2026  
Escopo: endereçamento inicial, entrada de novos SKUs, reendereçamento completo, governança centralizada e visibilidade do “as-is” operacional (Metabase), com escala de ~9 para até 50 lojas.

---

## Premissas explícitas (porque há lacunas no material)

1. O card do Metabase “localizações atuais” reflete o **estado operacional real** (WMS/estoque endereçado) e, portanto, é a melhor aproximação de “verdade” pós go-live.
2. O sistema interno **só aceita endereços via planilha** (formato tipo KDABRA/KDABTA). Logo, a arquitetura precisa de um **exportador confiável** para planilha.
3. Existem fontes “travadas” em Google Sheets (ex.: códigos de barras/EAN) e, na transição, isso deve ser tratado como **integração**, não como erro humano.
4. O arquivo `metabaseAPI.js` mencionado no contexto **não está presente** no workspace atual; portanto, eu trato a dependência de “Metabase API via Apps Script” como uma restrição real, mas sem detalhes de implementação.

---

# 1. Visão geral da proposta (recomendada)

## Abordagem principal (recomendada): “Plataforma Central de Endereçamento” (PCE)

Recomendação opinativa: **tirar a planilha do papel de “sistema”** e transformá-la em **artefato de entrada/saída**, com uma base central versionada e auditável.

Em termos práticos, a PCE separa 4 coisas que hoje estão misturadas:

1. **Dado mestre** (produto, barcode/EAN, volumetria/peso/caixaria, categoria de armazenagem, flags como `degelo`, `is_fragil`, `is_pesado`).
2. **Regras** (zonas/ruas, grupos proibidos, hotzone, isolamento de químicos, limites por equipamento).
3. **Plano** (endereçamento pretendido, por loja, com versionamento).
4. **Estado real (as-is)** (endereços atuais da operação, sincronizados de forma recorrente via Metabase/DB).

### Fonte de verdade (SoT) proposta

- **SoT de dado mestre e regras:** banco central (Postgres) + trilha de auditoria.
- **SoT do estado real operacional (pós go-live):** snapshots recorrentes vindos do **Metabase card** (na transição) e depois, idealmente, **direto do banco/origem do WMS**.
- **SoT do plano:** versão “aprovada” do plano no banco (com histórico), com export para Google Sheets/XLSX sempre que necessário.

### Papel de cada peça

- **Metabase**
  - Curto prazo: é o **conector mais fácil** para capturar o as-is (localizações, bloqueios, capacidade/uso etc.).
  - Médio prazo: vira **camada de visualização** (dashboards) e/ou “ponte” provisória enquanto a integração direta com a origem não vem.
- **Apps Script**
  - Curto prazo: pode continuar existindo como “cola” (UI/automação de Sheets) onde for inevitável.
  - Recomendado: **reduzir** Apps Script a:
    1) um “thin client” de UI (se necessário); e/ou  
    2) uma rotina controlada que chama a API central (PCE) e grava em Sheets.
  - Longo prazo: **remover dependência crítica** (sem testes, difícil de manter) e deixar o core no backend versionado (Python/Node com testes).
- **Planilhas (Google Sheets/XLSX)**
  - Permanecem por 2 motivos: lock-ins (EAN etc.) e export final obrigatório.
  - Mas deixam de ser “o sistema”; viram:
    - **Fonte legada** (ex.: aba “Código de barras produtos”) ingerida e cacheada; e
    - **Destino de export** (KDABRA/KDABTA, relatórios, anexos para áreas externas).

### Como suporta múltiplas lojas (9 → 50)

- Tudo no banco é “store-aware” (`store_id` em todas as tabelas relevantes).
- A criação de uma loja passa a ser: **cadastrar layout/equipamentos + aplicar regras + gerar plano v1**.
- O que muda com escala não é a operação manual, mas o **pipeline**:
  - sync recorrente do as-is,
  - diffs automáticos plano vs as-is,
  - governança de produto/regra centralizada com propagação controlada.

### Como lida com: novos produtos, correções e reendereçamento

- **Novos produtos:** entram por uma fila de “intake” (upload/integração) e passam por enrichment automático (volumetria/peso/caixaria/barcode/regra), caindo em “pendências” se algo essencial faltar (ex.: `degelo` para geladeira).
- **Correção de regra/categoria:** altera-se o mestre **uma vez**; a plataforma recalcula impacto e abre “tarefas de reendereçamento” por loja (com aprovação).
- **Reendereçamento completo:** começa do **as-is Metabase** (não da planilha antiga), gera um novo plano versionado, e exporta para planilha para execução.

---

# 2. Inventário do contexto analisado (materiais)

## Mais relevantes para entender o “como é hoje”

- `Code.js` (Apps Script): mostra o backend legado do dashboard em Sheets, com:
  - abas padrão (`Base_Produtos`, `Plano_Enderecamento_Final`, `Cadastro_Equipamentos`, `Volumetria_Equipamentos`, `Dicionario_Categorias`, `Regras_Ruas`, `Configuracoes_Operacionais`, logs);
  - cache (`CacheService`) e acoplamento forte a Sheets;
  - geração de abas de export como **KDABTA reenderecar** e **KDABRA enderecar**.
- `app.py` + `core/*` (FastAPI local): “clone” testável do backend, já com:
  - conexão a Google Sheets via OAuth (`core/gsheets_client.py`);
  - endpoints que espelham funções críticas (`getInitialData`, moves, versionamento, export);
  - testes (`tests/*`), reduzindo o risco do legado.
- `ETL/ETL (1).ipynb`: ETL que gera **MIX ENRIQUECIDO** com `degelo`, `is_fragil`, `prioridade_alocacao`, `peso_kg_unitario`, `is_pesado`, caixaria e logs (e suporta gspread/Colab e também modo “local XLSX”).

## Planilhas que ajudam a inferir entidades e contratos

- `ETL/ENDERECAMENTO_DARK_PINHEIROS (teste) (2).xlsx`:
  - abas “canônicas” de endereçamento:
    - `Base_Produtos` (contrato de dados do produto para endereçar),
    - `Plano_Enderecamento_Final` (slot a slot, com `location_id`, equipamento, flags, produto),
    - `Cadastro_Equipamentos`, `Volumetria_Equipamentos`, `Regras_Ruas`, `Dicionario_Categorias`,
    - `Log_Reenderecamento`, `Log_Alocacao_Detalhado`.
- `planilhas/arquivo/etl_pinheiros/ETL [PINHEIROS] (4).xlsx` e `planilhas/atuais/ETL_OUTPUT.xlsx`:
  - evidenciam as fontes de enrichment (categorias, volumetria, vendas) e logs de faltas.
- `planilhas/atuais/Conferência Produtos - [Pinheiros] (23).xlsx`:
  - mostra o pós go-live: conferência, faltas, “subir”, estoque/endereços atuais e aba de códigos de barras.
- Export do “estado real”:
  - `planilhas/arquivo/misc/estoque___produtos_por_endereco_...xlsx` (Metabase export): `id_localizacao`, `galpao`, `rua`, `posicao_pallete`, `escaninho_nivel`, `cod_produto`, `quantidade`, `data_validade`.
  - `planilhas/atuais/Pinheiros com is_gondola 0.xlsx`: endereços + flags como `is_gondola` e `is_blocked`.
- Reendereçamento/layout:
  - `planilhas/atuais/de_para_layout_revisado.xlsx` + `planilhas/atuais/de_para_validacao.xlsx` + `de_para_inconsistencias.md`: evidenciam necessidade de **de/para endereços** e validações (duplicados, inexistentes, “não existe mais”).

## Lacunas/ambiguidades/inconsistências encontradas

- O script “Metabase API via Apps Script” citado no contexto não está aqui; sem ele, não dá para avaliar:
  - estabilidade/autenticação, rate limits, retry, erros, cache, e contrato do card.
- Existe ambiguidade de identificadores:
  - loja/galpão aparece como `galpao_id` e também como `fulfillment_center_id` em export; e há a exceção `MOEMA1` fora do padrão `LJxxxxxx`.
- Há sinais de problemas recorrentes em dados-mestre:
  - colisões/duplicidades em barcode (`relatorio_barcode_conflitos_23.csv` e `relatorio_laranja_limao_23.md`);
  - necessidade de enrichment humano (ex.: `degelo`) que “não acontece” para poucos itens.
- O “contrato” exato do sistema interno para import de planilha não está documentado (assumo que KDABRA/KDABTA é o esperado).

---

# 3. Arquitetura sugerida (alvo recomendado)

## Conceito-chave: 4 camadas separadas

1. **Master Data (Produto e Regras)**
   - Produto: `product_code`, descrições, fabricante, subcategoria/categoria, `categoria_armazenagem`, volumetria, peso, caixaria, flags (`degelo`, `is_fragil`, `is_pesado`), e barcodes.
   - Regras: dicionário de categorias/grupos, preferências/hierarquias, hotzone, regras por rua/equipamento, grupos proibidos, isolamentos.
2. **Modelo físico (Loja, Equipamentos, Localizações)**
   - Loja: `store_id` (canônico), mapeamento para IDs externos.
   - Equipamentos: rua, número, tipo, parâmetros (níveis, escaninhos por nível, capacidade).
   - Localização (slot): `location_id` gerado e atributos (nível, posição, capacidade, flags de bloqueio/uso).
3. **Plano versionado**
   - Plano é um conjunto de alocações produto → slots, com metadados e logs.
   - Toda mudança gera:
     - versão do plano,
     - diffs,
     - trilha de auditoria (quem/por quê).
4. **Estado real (as-is) + reconciliação**
   - Snapshot do Metabase (ou origem) com “onde está hoje”.
   - Um reconciliador calcula:
     - divergências plano vs as-is,
     - mudanças operacionais “não governadas”,
     - alertas e relatórios.

## Componentes recomendados (implementação)

**(Recomendado) Evoluir o que já existe aqui** (`app.py` + `core/*`) em vez de recomeçar do zero:

1. `addressing-api` (FastAPI) + `postgres`
   - Endpoints para: cadastros, regras, geração de layout, geração/edição de plano, versionamento, export.
2. `sync-jobs` (scheduler: cron/Prefect/Airflow-lite)
   - `sync_metabase_as_is`: captura card(s) do Metabase → tabela `operational_location_snapshot`.
   - `sync_sheets_masterdata`: ingere planilhas-mãe (EAN/barcodes, caixaria etc.) → tabelas de mestre (com “lineage”).
3. `planner-ui`
   - Pode começar com o `Dahsboard.html` atual (já fala com API), mas apontando para API central.
4. `exporter`
   - Gera:
     - planilha KDABRA/KDABTA,
     - relatórios (mix total, ocupação, equipamentos),
     - pacote para áreas externas (CSV/PDF padronizado).
5. Observabilidade
   - logs estruturados + auditoria de alterações + métricas (sucesso de sync, atrasos, divergências).

## Papel das planilhas na arquitetura

- **Entrada (somente quando inevitável):**
  - barcode/EAN e algumas bases “importadas” por fórmulas/IMPORTRANGE.
  - arquivos de mix recebidos por e-mail (viram upload padronizado).
- **Saída (sempre):**
  - export final no formato do sistema interno.
  - “espelhos” de consulta para times que dependem de Sheets.

## Metabase na arquitetura

- Curto prazo: **extrator do as-is** (card como API/CSV) + dashboards de operação.
- Longo prazo: preferível **migrar a extração** para o banco/origem do WMS (reduz risco de API desconhecida).

## Versionamento e histórico (mínimo necessário)

- Tabelas (conceitual):
  - `product_master` (SCD2: versões por data),
  - `barcode_map` (com origem: Sheet X, aba Y, data),
  - `store`, `equipment`, `location_slot`,
  - `plan` + `plan_version` + `plan_item`,
  - `operational_location_snapshot` (particionado por data/loja),
  - `change_event` (event log: mudança manual, regra, sync).

Isso resolve 2 perguntas que hoje são difíceis:
1) “O que era verdade no dia do go-live?”  
2) “O que a operação mudou depois, e quando?”

## Lock-in de Sheets (EAN/barcode) — como lidar sem travar o futuro

- Estratégia recomendada: **Sheet como upstream, DB como cache e SoT interno**.
- Ingestão recorrente (ex.: 1h/1d) lê a aba “Código de barras produtos” (ou equivalente), valida, gera relatório de conflitos e persiste.
- Em paralelo, abrir caminho para substituir a fonte (integração com cadastro corporativo/ERP), sem quebrar a operação atual.

---

# 4. Fluxos operacionais futuros (como deveria funcionar)

## 4.1 Abertura de nova loja (endereçamento do zero)

1. Infra entrega layout físico → entra como “Cadastro de Equipamentos” (padrão).
2. PCE gera `location_id`/slots e valida capacidade (incluindo regras: hotzone, proibidos, químicos).
3. Mix chega (arquivo) → pipeline de intake:
   - enrichment automático (volumetria, caixaria, peso, degelo/fragilidade quando possível),
   - lista de pendências (ex.: “geladeira sem degelo”) com SLA de resolução.
4. Planner faz alocação (UI), salva versão “Plano v1 – Go-live”.
5. Exportador gera planilha de import (KDABRA/KDABTA) + “pacote de operação”.
6. Após go-live:
   - sync as-is inicia,
   - dashboard de divergência acompanha mudanças reais.

## 4.2 Entrada e endereçamento de novos produtos

1. Novo SKU entra na fila (upload/integração).
2. Enrichment roda sempre (mesmo para 1 SKU).
3. SKU fica em “pendente de endereçamento” por loja (se aplicável) e aparece no planner.
4. Export incremental (quando necessário) para o sistema interno.

## 4.3 Sazonais (Páscoa etc.)

1. Criar “campanha” com validade e lojas-alvo.
2. PCE gera:
   - um subconjunto do mix (campanha),
   - regras temporárias (zona sazonal, exceções de layout),
   - plano versionado “Sazonal vX”.
3. Termino da campanha:
   - rollback assistido (plano anterior) ou plano “pós-sazonal” gerado.

## 4.4 Correção de categoria/regra de um produto existente

1. Corrigir no mestre (1 vez).
2. PCE calcula impacto:
   - lojas onde o SKU existe,
   - risco (químico/isolamento, frio/degelo),
   - necessidade de reendereçar.
3. Gera tarefas por loja (com aprovação) e exporta quando executado.

## 4.5 Reendereçamento completo de uma loja em operação

1. Capturar as-is (snapshot Metabase) como base do “estado atual”.
2. Congelar baseline (versão) e gerar “Plano vNext”.
3. Aplicar de/para de layout (se mudou equipamento/rua) e validar (duplicados, inexistentes, “não existe mais”).
4. Executar reendereçamento no planner (limpar/realocar com regras).
5. Exportar planilha para execução e registrar “cutover”.
6. Pós cutover:
   - reconciliar as-is vs plano vNext,
   - monitorar divergências e ajustes.

## 4.6 Acompanhamento de mudanças após go-live (governança contínua)

- Sync recorrente as-is (Metabase/origem) + diffs automáticos:
  - “mudanças fora do plano”,
  - “produtos em local proibido”,
  - “ocupação acima do limite / hotzone desrespeitada”,
  - “SKU novo aparecendo no estoque sem enrichment”.
- Alertas (Slack/e-mail) e relatórios semanais.

## 4.7 Fornecimento de informações para áreas externas

- “Pacotes” padronizados por loja (gerados automaticamente):
  - lista de equipamentos e tipos,
  - mapa de capacidade/ocupação,
  - export de mix e endereços por zona/categoria.

---

# 5. Tratamento explícito das dores, dependências e restrições

## 5.1 Gestão de várias lojas ao mesmo tempo

- Problema atual: operação “planilha por planilha”, organização manual no Drive.
- Impacto: gargalo humano e risco de versão errada.
- Mitigação: PCE centraliza e gera artefatos por loja; UI filtra por loja e “versão do plano”.
- Trade-offs/risco: precisa disciplina de “tudo passa pela PCE” (governança), e migração inicial demanda esforço.

## 5.2 Gestão de produtos novos (não rodam ETL / sem enrichment)

- Problema atual: pequenos lotes não passam no ETL; `degelo` e outros enriquecimentos não são feitos.
- Impacto: produto cai em categoria errada, endereçamento ruim e retrabalho.
- Mitigação: intake automatizado + enrichment sempre-on + fila de pendências com “bloqueio” (não permitir virar plano aprovado sem campos críticos).
- Trade-offs/risco: pode “atrasar” go-live se dados mestres estiverem ruins; solução é SLA e fallback (regras default explícitas, com dívida registrada).

## 5.3 Bagunça pós endereçamento inicial (planilha deixa de ser confiável)

- Problema atual: operação muda endereços e não atualiza planilha.
- Impacto: baixa confiança; reendereçamento parte de premissa errada.
- Mitigação: tratar Metabase (as-is) como fonte pós go-live + reconciliação automática e alertas.
- Trade-offs/risco: Metabase pode não ter o “motivo” da mudança; resolve com trilha de eventos (quando houver) + aproximação por diffs.

## 5.4 Informações não centralizadas (scripts, planilhas, bases auxiliares)

- Problema atual: tudo espalhado (ETL, planilha recebida, app, bases).
- Impacto: difícil de manter e treinar; alto risco operacional.
- Mitigação: PCE como “hub” (um lugar) + conectores para sheets/metabase.
- Trade-offs/risco: exige definir contratos (schemas) e manter compatibilidade com export final.

## 5.5 Mudanças em produto já existente (propagar para todas as lojas)

- Problema atual: correção de categoria/regra exige lembrar e aplicar manualmente em N lojas.
- Impacto: inconsistência entre lojas e retrabalho.
- Mitigação: mestre central + “impact analysis” automático + tarefas por loja + export controlado.
- Trade-offs/risco: precisa de regra clara: mudanças “quebram” planos aprovados? Recomendo: não sobrescrever; abrir “plano vNext”.

## 5.6 Falta de rastreamento consolidado da operação

- Problema atual: perguntas básicas (mix total, ocupação, quantos equipamentos) não são triviais.
- Impacto: decisões lentas e baseadas em feeling.
- Mitigação: banco central + métricas padronizadas + dashboards (Metabase/BI) em cima das tabelas.
- Trade-offs/risco: definir métricas uma vez (ocupar, capacidade, “pressão”) e manter consistência.

## 5.7 Dificuldade para fornecer informações a áreas externas

- Problema atual: PDFs e listas por WhatsApp.
- Impacto: rework e ruído.
- Mitigação: exportador de “pacotes” e links únicos por loja/versão.
- Trade-offs/risco: precisa governar acesso (permissões).

## 5.8 Informações duplicadas (abas replicadas e versões defasadas)

- Problema atual: duplicação em várias planilhas (ex.: barcode) e drift.
- Impacto: conflito e decisões erradas.
- Mitigação: “single write” no mestre; sheets viram espelhos/exports; ingestão com validação e relatórios de conflitos.
- Trade-offs/risco: enquanto houver upstream em Sheets, ainda existe risco; mitiga com validação automática e ownership.

## 5.9 Falta de visibilidade ao vivo das mudanças

- Problema atual: não se sabe o que mudou pós go-live.
- Impacto: baixa governança e planejamento ruim.
- Mitigação: sync as-is + diffs + alertas; e, quando possível, capturar logs de eventos do WMS.
- Trade-offs/risco: “perto do real-time” depende da fonte; comece com diário/horário.

## 5.10 Baixa confiança técnica no sistema atual (Apps Script legado)

- Problema atual: difícil testar; acoplamento forte a Sheets.
- Impacto: medo de mexer e regressões.
- Mitigação: mover core para backend com testes (já iniciado com `app.py` e `tests/*`).
- Trade-offs/risco: manter compatibilidade com UI/planilhas no curto prazo.

## 5.11 Restrição: dependência crítica da Metabase API via Apps Script (não controlada)

- Problema atual: risco operacional (sem dono, sem SLA).
- Impacto: se cair, você perde o “as-is”.
- Mitigação:
  - curto prazo: encapsular em um “conector” com cache e retry; export manual como fallback;
  - médio prazo: obter acesso direto à origem (DB/WMS) ou criar um serviço interno que expõe a consulta como API com SLA.
- Trade-offs/risco: depende de alinhamento organizacional e acesso a dados.

## 5.12 Restrição: lock-in em Google Sheets (EAN/barcodes e fórmulas)

- Problema atual: dado crítico só existe em Sheets e às vezes via “gambiarra” (imports).
- Impacto: trava arquitetura e performance.
- Mitigação: ingestão para DB (cache/SoT interno), mantendo Sheet como upstream até substituição.
- Trade-offs/risco: duplicidade temporária (Sheet + DB) — mitigada com “read path” padronizado (sempre ler do DB para o sistema).

## 5.13 Restrição: export final precisa ser planilha

- Problema atual: mesmo que você centralize, precisa “voltar” para planilha.
- Impacto: risco de erro na última milha.
- Mitigação: exportador determinístico + testes + validações (schema, duplicados, endereços inexistentes).
- Trade-offs/risco: se o contrato do import mudar, precisa atualização rápida (versionar formato).

---

# 6. Dependências e restrições (checklist)

## Técnicas

- Acesso ao card do Metabase (e estabilidade do card/query).
- Credenciais OAuth do Google para ler/escrever Sheets (já existe em `core/gsheets_client.py`).
- Capacidade de rodar jobs agendados (cron/VM/container).
- Banco (Postgres) e política de backup/restore.

## Organizacionais

- Ownership do dado mestre (produto, barcode/EAN, volumetria/caixaria).
- Acesso (ou caminho) para integração direta com a origem do WMS (para substituir Metabase como extrator).
- Definição de “aprovação” de plano (quem assina o go-live e reendereçamento).

## Riscos específicos (Metabase API + legado)

- Metabase API (ou card) pode mudar sem aviso.
- Apps Script sem testes pode quebrar silenciosamente.
- Planilhas com fórmulas/imports podem degradar e gerar dados inconsistentes (especialmente barcode).

## Restrições inevitáveis

- Export para planilha é obrigatório no final.
- Algumas fontes podem continuar em Sheets por meses.
- Operação vai continuar fazendo mudanças “no mundo real”; logo, governança tem que ser **automática**, não só manual.

---

# 7. Arquitetura alvo vs arquitetura de transição (pragmática)

## 7.1 Arquitetura ALVO (ideal)

**DB + API central + UI + sync as-is**

- Entrada:
  - upload mix (arquivos),
  - ingest de sheets-mãe (EAN/barcode etc.),
  - sync as-is (Metabase/origem).
- Core:
  - regras + modelo físico + plano versionado.
- Saída:
  - export KDABRA/KDABTA por loja/versão,
  - dashboards e alertas.

## 7.2 Arquitetura de TRANSIÇÃO (para executar “HOJE” sem travar)

Recomendação opinativa: **continuar endereçando no fluxo atual**, mas com 4 “facilitadores” imediatos:

1. **Dashboard local + API testável** (este repositório) como “backend de confiança” para operar sobre Google Sheets.
2. **Planilhas-mãe centralizadas** (um único Google Sheets) para barcode/EAN, volumetria/caixaria/peso e dicionários.
3. **ETL rodando no localhost** (não no Colab), sempre que houver SKU novo, mesmo que seja 1 item.
4. **Import do as-is via Metabase export** (manual hoje, automático na fase 2), para reendereçar lojas com base no real.

### Como executar HOJE: endereçar loja nova (passo a passo)

1. Subir o dashboard local:
   - Docker: use `RUN_ENDERECAMENTO_LOCAL.md` (compose) e abra `http://127.0.0.1:8000`.
2. Criar (ou clonar) uma planilha de loja a partir do template que contém as abas padrão:
   - `Base_Produtos`, `Plano_Enderecamento_Final`, `Cadastro_Equipamentos`, `Volumetria_Equipamentos`, `Dicionario_Categorias`, `Regras_Ruas`, `Configuracoes_Operacionais`, logs.
3. Fixar as “planilhas-mãe”:
   - manter um Google Sheet mestre (ex.: `MASTER_DATA_ENDERECAMENTO`) com abas:
     - `Código de barras produtos` (EAN/barcode → `product_code`),
     - `Volumetria_Equipamentos`,
     - `Caixaria`/`Caixaria nova compras` (se existir),
     - `Produtos geradores` (degelo/fragilidade/prioridade),
     - `Dicionario_Categorias` e regras.
   - na planilha da loja, puxar via link/IMPORTRANGE (se necessário hoje) ou copiar/colar valores.
4. Rodar ETL local para gerar o mix enriquecido:
   - input: arquivo de mix recebido por e-mail (3 colunas mínimas) + planilhas-mãe.
   - output: `MIX ENRIQUECIDO` (campos como `degelo`, `is_pesado`, `escaninhos_necessarios`).
5. Colar/atualizar `Base_Produtos` na planilha da loja com o mix enriquecido.
6. Construir layout virtual:
   - preencher `Cadastro_Equipamentos` + `Volumetria_Equipamentos` + regras por rua.
   - gerar slots (`Plano_Enderecamento_Final`) (se hoje isso ainda depender do legado/colab até o “bloco 5”, mantenha; depois migra).
7. Endereçar (alocar) via dashboard e exportar:
   - gerar `KDABRA enderecar` e/ou `KDABTA reenderecar` para subir no sistema interno.

### Como executar HOJE: reendereçar uma loja inteira (passo a passo)

1. Puxar as-is do Metabase:
   - exportar o card (CSV/XLSX) com `id_localizacao`, `cod_produto`, `quantidade`, `data_validade`.
   - (se disponível) exportar também bloqueios/flags (`is_blocked`, `is_gondola`).
2. Carregar esses exports na planilha da loja (abas tipo `Estoque_Atual`, `Enderecos_Bloqueados`).
3. Se houve mudança física de layout:
   - montar `DePara` (endereço antigo → novo) e validar com uma planilha tipo `de_para_validacao.xlsx`.
4. Gerar `Plano_Enderecamento_Final_Layout_Atual` (baseline do layout atual) e salvar “Plano baseline (as-is)”.
5. “Zerar” o plano para reendereçar:
   - limpar alocações do `Plano_Enderecamento_Final` (mantendo slots) e iniciar nova versão.
6. Reendereçar no dashboard, exportar planilha e executar o cutover.
7. Pós cutover (mesmo manual hoje): exportar novamente do Metabase e comparar divergências.

---

# 8. Roadmap sugerido (fases)

## Fase 0 — Hoje/semana 1: destravar execução com menos dor

- Centralizar “planilhas-mãe” (barcode/EAN, volumetria, caixaria, produtos geradores, dicionários).
- Rodar ETL sempre (local), com logs de faltas e pendências.
- Padronizar template de loja (abas e nomes fixos).
- Definir procedimento padrão de reendereçamento começando do as-is (Metabase export).

## Fase 1 — Centralização mínima (2–4 semanas)

- Subir PCE com Postgres + API (pode ser evolução do `app.py`) em ambiente compartilhado.
- Persistir:
  - produto mestre + barcode (ingest de Sheets),
  - store/equipment/location,
  - versões do plano por loja.
- Exportador determinístico (KDABRA/KDABTA) com validações.

## Fase 2 — Integração recorrente com estado real (4–6 semanas)

- Conector “as-is” (Metabase API/CSV) com:
  - cache, retry, logs,
  - snapshots por loja e diffs automáticos.
- Primeiro dashboard de “divergência plano vs as-is”.

## Fase 3 — Governança de novos produtos e regras (6–10 semanas)

- Intake oficial de SKU novo (upload) + enrichment automático + fila de pendências.
- Gestão de regras versionada (quem mudou, quando, por quê) e propagação por loja.

## Fase 4 — Dashboards e notificações (10–14 semanas)

- KPIs: mix total, ocupação por loja/equipamento, pressão de espaço, geladeiras/freezers por loja, “top divergências”.
- Notificações automáticas (Slack/e-mail) para:
  - produto novo no as-is sem enrichment,
  - produto em local proibido,
  - alterações massivas pós go-live.

## Fase 5 — Reendereçamento completo automatizado (14+ semanas)

- Assistentes de reendereçamento:
  - geração de plano vNext a partir do as-is,
  - simulação de impacto e capacidade,
  - cutover assistido (pré/pós validações).

---

# 9. Recomendações objetivas (fechamento opinativo)

## O que manter

- O conceito de abas padrão (`Base_Produtos`, `Plano_Enderecamento_Final`, `Cadastro_Equipamentos`, `Volumetria_Equipamentos`, `Dicionario_Categorias`, `Regras_Ruas`, logs) — elas já são um **contrato operacional**.
- O dashboard/UI existente (HTML) como front inicial.
- O FastAPI local (`app.py` + `core/*`) como base para um backend testável.

## O que eliminar (ou reduzir ao mínimo)

- Apps Script como **dependência crítica** do core (manter só como adaptador temporário).
- Processos que dependem de “disciplina perfeita” (ex.: “rodar ETL só quando lembrar”).

## O que centralizar imediatamente

- **Planilhas-mãe** (barcode/EAN, volumetria, caixaria, produtos geradores, dicionários e limites operacionais).
- Uma “tabela canônica” de lojas (mapeando: nome → `store_id` → ids externos).

### Mapeamento canônico recomendado (já no seu prompt)

- Higienópolis = `LJ100001`
- Pinheiros = `LJ090001`
- Vila Mariana = `LJ150001`
- Barra Funda = `LJ130001`
- Morumbi = `LJ140001`
- Brooklin = `LJ160001`
- Alto de Pinheiros = `LJ120001`
- Moema = `MOEMA1` (exceção: tratar via tabela de mapping, não “if” espalhado)
- Vila Olímpia = `LJ110001`
- Jardins = `LJ060001`

## O que tratar como dívida técnica (com prazo)

- Metabase como fonte de extração do as-is (substituir por integração direta com a origem quando possível).
- Qualquer base crítica que hoje exista só como fórmula/import em Sheets (migrar para pipeline com validação).

## Fonte de verdade ideal

- **DB central (Postgres) + event log** para mestre/regras/plano.
- **Snapshots as-is** recorrentes e reconciliação contínua.

## Papel mínimo aceitável das planilhas no futuro

- **Somente**:
  1) upstream provisório para fontes legadas (lidas e cacheadas pelo DB); e  
  2) artefato de export/import (KDABRA/KDABTA) + relatórios para consumo humano.

---

## Apêndice: “check de sanidade” que eu recomendo padronizar (automático)

1. Conflitos de barcode (duplicados e colisões normalizadas).
2. Produtos frios sem `degelo` (especialmente “geladeira”).
3. Produtos químicos fora de zona permitida.
4. Endereços inexistentes / “não existe mais” no de/para.
5. Slots bloqueados (`is_blocked`, `is_gondola=0`) recebendo alocação.
6. Diferença entre plano aprovado vs as-is (volume de divergência e hotspots).

