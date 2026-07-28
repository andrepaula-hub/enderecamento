# Regras de Enderecamento para Agente

Status: rascunho para revisao operacional.

Este documento consolida regras inferidas do frontend/backend atual e decisoes operacionais informadas na conversa. Ele deve ser tratado como fonte revisavel antes de virar regra executavel do agente.

## Fontes Atuais

- `shopper_front/`: UI atual servida em `localhost:8000` via FastAPI (`app.py`) e `/shopper-static/`.
- `Dahsboard.html`: legado; nao e servido pelo app atual e nao deve ser usado como fonte para novas alteracoes.
- `core/initial_data.py`: metricas de capacidade, planejamento por curva, planejamento de prateleira e separacao de quimicos.
- `core/enrichment_pipeline.py`: enriquecimento de `Base_Produtos`, calculo de `is_pesado` por limite de peso e campos de categoria/degelo.
- `core/gsheets_backend.py` e `core/moves.py`: persistencia de movimentos, equipamentos, slots, filtros e export.

## Fonte Unica Do Motor

Toda decisao de alocacao deve consumir uma unica fonte da verdade: `core/agent_scoring.py`, acessado por use cases/endpoints backend.

O frontend nao deve conter regra propria de escolha de escaninho, score, greedy, penalidade de adjacencia, desempate ou validacao dura. Ele pode:

- mostrar mapa/produtos;
- coletar filtros e escopo;
- chamar endpoint backend;
- aplicar/renderizar os movimentos retornados;
- destacar violacoes remanescentes como validacao visual.

Nao adicionar novos algoritmos locais em `shopper_front/`. Fluxos como equipamento inteiro, nivel horizontal, coluna vertical, rua e loja inteira devem diferir apenas no escopo enviado ao backend.

## Classificacao de Severidade

- Regra dura: o agente nao deve violar. Se a loja nao couber sem violar, ele para em estado seguro, explica a decisao de negocio necessaria e aguarda aprovacao.
- Regra condicionada: o agente pode propor violar somente como fallback explicito, com resumo de impacto e aprovacao.
- Regra branda: preferencia de score/ordenacao; pode ceder para acomodar capacidade.

## Fluxo de Decisao do Agente

1. Pedir janela de vendas.
2. Pedir o escopo do enderecamento: loja toda, apenas geladeiras, apenas prateleiras, apenas freezers, uma rua, ou equipamentos especificos.
3. Pedir link da planilha de enderecamento.
4. Pedir link da planilha de mix.
5. Usar a planilha ETL mae fixa.
6. Inferir internamente qualquer parametro necessario para vendas/Metabase a partir da planilha, sem perguntar a loja como decisao operacional.
7. Rodar vendas alvo.
8. Rodar ETL para atualizar `Base_Produtos`.
9. Gerar escaninhos se `Plano_Enderecamento_Final` ainda nao estiver pronto.
10. Rodar autoenderecamento em previa, sem gravar.
11. Revisar bloqueios, violacoes, falta de capacidade e decisoes condicionadas.
12. Se houver decisao de negocio, parar antes de mudancas drasticas.
13. Aplicar somente apos aprovacao.
14. Salvar versao do plano.
15. Exportar KDABRA somente se o usuario pedir.

## Planilhas

- ETL mae: fixa.
- Mix: variavel; o agente deve sempre pedir.
- Enderecamento: variavel; o agente deve sempre pedir.
- Modelo por loja: existe, mas nao deve entrar no fluxo do agente. O agente recebe mix e enderecamento ja prontos no modelo.

## Compatibilidade por Categoria de Armazenagem

Origem: `AUTO_FILL_RULES_DEFAULTS.compatibilityMatrix`.

Regra dura.

- `seco` so deve ir para: `prateleira`, `prateleira lateral`, `prateleira_lateral`, `prateleira_alta`.
- `refrigerado` so deve ir para: `geladeira`, `geladeira_alta`, `geladeira_americana`.
- `congelado` so deve ir para: `freezer`.

Neste contexto, produto seco significa item cuja categoria de armazenagem e de prateleira, isto e, nao refrigerado e nao congelado.

Observacao: o agente deve normalizar nomes equivalentes antes de validar.

## Quimicos e Perfumaria

Origem parcial: metricas atuais agrupam `quimico` e `perfumaria` para analise; decisao operacional atual separa a regra dura de quimicos.

Regra dura para quimicos.

- Quimicos nao podem ficar proximos de produtos normais.
- Quimicos podem ficar proximos de perfumaria.
- Perfumaria pode ficar com quimicos.
- Perfumaria tambem pode ficar com produtos normais, incluindo alimentos, salvo outra regra especifica.
- O agente nao deve escolher sozinho quais equipamentos sao afastados se isso depender de layout fisico.
- Para isolar quimicos, o agente deve pedir uma das duas entradas:
  - identificacao dos equipamentos/ruas afastados; ou
  - imagem/layout da loja para analise.
- Se nao houver equipamento isolado, o agente deve pedir autorizacao para usar estrategia de buffer.

Pendente de definicao: criterio exato de "proximo" para o validador automatico.

Sugestao inicial para codigo:

- Mesmo equipamento: proibido entre quimico e normal.
- Equipamento adjacente: proibido entre quimico e normal, a menos que usuario aprove.
- Mesma rua: permitido somente se equipamento estiver marcado como zona quimica isolada.

Definicao de produto normal para essa regra:

- qualquer produto de prateleira cujo grupo nao seja `quimico` nem `perfumaria`;
- alimentos, bebidas, FLV, neutros e demais grupos nao quimicos/perfumaria contam como normais;
- perfumaria e excecao: pode ficar junto de quimicos ou junto de normais.

Estrategia de buffer quando nao ha equipamento isolado:

- Usar quimicos no miolo do equipamento ou da zona.
- Usar perfumaria ou produtos neutros como separadores nas pontas e contatos com produtos normais.
- Quimico pode tocar quimico e perfumaria.
- Quimico nao pode tocar alimento, bebida, FLV ou outro normal.
- Se nao houver perfumaria/neutros suficientes para criar buffer, parar e explicar a falta.

## Pesados

Origem: `is_pesado` vem da planilha/base; `core/enrichment_pipeline.py` tambem calcula por limite de peso. Frontend aplica regra especial para peso acima de 2kg e prateleiras.

Regra dura.

- Produto pesado e regra de peso se aplicam somente a prateleiras.
- Produtos marcados como `is_pesado` nao devem ficar no nivel de topo configurado.
- Produtos com `peso_kg_unitario > 2` devem ficar no nivel configurado como permitido para pesados acima de 2kg.
- No padrao atual do frontend, esse nivel permitido e `4`.
- Pesados devem priorizar niveis do meio.
- O agente deve tratar "pesado" como:
  - `is_pesado` da planilha quando disponivel;
  - calculo do ETL quando a pipeline definir o campo;
  - nunca por inferencia livre de nome do produto.

Pendente de revisao: confirmar se "nivel 4" deve ser literal para todas as prateleiras ou se deve virar "nivel do meio" dinamico por tipo de equipamento.

## Ovos

Origem: frontend detecta produto cujo primeiro termo do nome e `ovo` ou `ovos`.

Regra dura.

- Ovos nao podem ficar no nivel mais baixo.
- Ovos nao podem ficar no nivel mais alto.
- No padrao atual do frontend, ovos sao permitidos nos niveis `2` a `4`.
- O agente deve validar ovos por cadastro/nome enquanto nao houver flag especifica.

Pendente de revisao: se a loja tiver prateleira com quantidade diferente de niveis, transformar regra em "niveis intermediarios" em vez de faixa literal `2-4`.

## FLV

Origem: `AUTO_FILL_RULES_DEFAULTS` e validacoes do frontend.

Regra dura no frontend atual.

- FLV nao deve ficar nas quinas de geladeira.
- FLV nao deve ficar nos niveis `1` e `5` das prateleiras.
- Fora dos niveis `1` e `5` de prateleira, FLV pode ficar em qualquer nivel/canto permitido pela compatibilidade do equipamento.
- Nao precisa de bonus extra para centro da prateleira.

## Nivel Mais Alto

Decisao operacional atual.

Regra condicionada.

- Por padrao, nao usar o nivel mais alto.
- Usar nivel mais alto somente se faltar espaco sem ele.
- Se for necessario usar nivel mais alto em parte da loja, priorizar a parcela onde esta a curva C.
- Justificativa operacional: curva C sai pouco, entao o operador acessa menos aquela area.
- O agente deve parar e pedir aprovacao antes de usar nivel mais alto em escala relevante.

Escala relevante:

- a partir de uma rua toda, considerar relevante;
- abaixo disso, o agente pode inferir pelo impacto operacional e explicar o criterio usado.

## Dois Produtos por Endereco

Origem: frontend permite segundo slot com validacao; decisao operacional restringe uso.

Regra condicionada.

- Nao usar dois produtos por endereco no plano inteiro por padrao.
- Usar segundo produto por endereco apenas se sobrarem poucos produtos e nao houver espaco suficiente.
- Preferir escaninhos com volumetria pouco usada.
- Nao permitir dois produtos da mesma subcategoria no mesmo escaninho.
- Validar capacidade volumetrica antes de usar slot duplo.
- O agente deve parar e pedir aprovacao antes de ativar slot duplo como solucao de capacidade.

Pendente de definicao:

- percentual maximo de uso volumetrico para considerar "volumetria pouco usada";
- quantidade de "poucos produtos" que permite propor slot duplo.

Ambos podem ser inferidos pelo agente na previa:

- quanto menor o volume usado, melhor;
- respeitar sempre a regra de subcategoria;
- explicar o criterio usado quando propor slot duplo.

## Produtos Multi-Escaninho

Origem: `core/agent_scoring.py`.

Regra dura.

- Produto que exige mais de um escaninho deve receber sempre um bloco contiguo.
- Preferir bloco horizontal no mesmo nivel.
- Se nao houver bloco horizontal, permitir apenas bloco contiguo empilhado/alinhado entre niveis adjacentes.
- Produto parcialmente alocado e proibido por regra dura.
- Nao usar score para "comprar" uma quebra dessa regra.

Regra especifica de geladeira:

- produto de geladeira que exigiria mais de 4 escaninhos pode ser limitado a no maximo 4 escaninhos quando `degelo = PODE`;
- se o limite de 4 escaninhos gerar falta operacional, o agente deve explicar na previa.

## Subcategoria, Familia Visual e Fabricante

Origem: `core/agent_scoring.py`.

Regra dura para subcategoria especifica.

- Duas SKUs diferentes da mesma subcategoria especifica nao devem ficar no mesmo nivel do mesmo equipamento.
- A proibicao vale para preenchimento de equipamento, nivel horizontal, coluna vertical, rua inteira e loja inteira.
- Subcategorias genericas como vazio, `outros`, `geral`, `mercearia` e `limpeza` nao acionam essa regra.
- Se uma SKU nao couber sem repetir subcategoria no nivel, ela deve ficar nao alocada para que outra SKU do filtro possa ocupar o endereco.
- O backend deve validar o lote final antes de devolver movimentos; se o lote ainda terminar com repeticao de subcategoria no mesmo nivel, os movimentos responsaveis sao descartados.

Regra media para familia visual.

- `familia_visual` deve ser coluna do ETL/base quando existir taxonomia curada.
- Na falta da coluna, o motor pode inferir uma familia visual pelo nome normalizado para reduzir repeticoes obvias como variantes de uma mesma linha.
- Familia visual deve evitar concentracao no mesmo nivel/equipamento, mas nao deve bloquear alocacao como regra dura sem aprovacao operacional.

Regra leve para fabricante.

- Evitar concentracao de fabricante no mesmo nivel e, em segunda prioridade, no mesmo equipamento.
- Fabricante nao deve bloquear por regra dura, porque fabricantes grandes podem ter categorias visualmente muito diferentes.

## Curva

Origem: backend calcula planejamento por curva; decisao operacional usa curva C para nivel alto quando necessario.

Regra branda/condicionada.

- O agente deve considerar curva na distribuicao de capacidade.
- Curvas devem preferir ruas/zonas correspondentes a sua frequencia de venda.
- Se o usuario nao informar logica de ruas, o agente pode perguntar a logica antes de preencher, por exemplo: qual rua/zona deve receber o que vende menos e qual deve receber o que vende mais.
- Logica comum: quanto menor o numero da rua, maior o giro/vendas esperado; quanto maior o numero da rua, menor o giro.
- Com essa resposta, curvas D/C devem preferir a zona de menor giro e curvas A/B devem preferir a zona de maior giro.
- Se as ruas informadas nao comportarem todos os produtos da curva esperada, o agente deve avisar que precisa de mais ruas/zona ou pedir autorizacao para misturar curvas.
- Curva C e candidata preferencial para areas menos ergonomicas quando nao houver alternativa.
- Nao usar nivel alto apenas porque o produto e curva C; usar somente se faltar capacidade sem ele.

## Capacidade e Parada Segura

Decisao operacional atual.

Regra dura de fluxo.

- Se a loja couber respeitando regras duras e sem decisoes drasticas, o agente pode seguir para previa.
- Se nao couber sem usar nivel alto, slot duplo, relaxar isolamento ou adicionar equipamentos, o agente deve parar.
- Ao parar, deve explicar:
  - qual recurso faltou;
  - quantos bins/SKUs faltam;
  - quais opcoes existem;
  - impacto operacional de cada opcao.
- O agente deve aguardar decisao antes de aplicar.

Exemplo de mensagem esperada:

> A loja nao comporta o mix usando apenas niveis permitidos e um produto por endereco. Faltam X bins em prateleira e Y em geladeira. As opcoes sao: liberar segundo produto por endereco em escaninhos com baixa volumetria, liberar nivel alto para curva C, ou adicionar equipamentos. Posso seguir com alguma dessas opcoes?

## Pendencias de Dados

Regra dura de fluxo.

- Se faltar mix, volumetria, categoria de armazenagem, grupo, degelo quando necessario, ou campos essenciais de venda/curva, o agente deve parar em estado seguro.
- O agente nao deve inferir grupo por nome/categoria_site durante uma execucao real. Se `grupo` veio vazio depois do ETL, isso e bloqueio de dados/ETL.
- Se o ETL falhar, nao rodar previa nem aplicar movimentos.
- Se o sistema ja tiver rotina para enviar pendencias ao ETL, o agente pode preparar as pendencias, mas nao deve inventar valores.
- Volumetria padrao so deve ser aplicada se houver decisao operacional explicita.

## Validacoes Antes de Aplicar

O agente deve gerar relatorio de previa com pelo menos:

- total de produtos alocados;
- total de produtos nao alocados;
- uso de nivel alto;
- uso de slot duplo;
- violacoes duras bloqueadas;
- decisoes condicionadas propostas;
- equipamentos reservados para quimicos;
- produtos sem dados essenciais;
- capacidade por tipo de equipamento;
- faltas por curva e categoria;
- diferenca antes/depois se ja havia plano.
