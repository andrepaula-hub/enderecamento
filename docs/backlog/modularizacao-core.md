# Backlog: Modularização de `core/gsheets_backend.py` e `core/initial_data.py`

**Status:** Débito técnico — não concluído  
**Prioridade:** Média  
**Estimativa:** 1–2 dias de engenharia  

---

## Contexto

Durante a sprint de modularização de `core/` (junho 2026), os arquivos mais longos foram divididos em módulos menores:

| Arquivo original | Módulo extraído | Resultado |
|---|---|---|
| `agent_tools.py` (935 linhas) | `agent_scoring.py` (471 linhas) | OK — `agent_tools.py` → 529 linhas |
| `card175_snapshot.py` (948 linhas) | `card175_location.py` (170 linhas) | OK — `card175_snapshot.py` → 801 linhas |
| `gsheets_backend.py` (2516 linhas) | `gsheets_versions.py` (90 linhas) | Parcial — `gsheets_backend.py` → 2447 linhas |
| `initial_data.py` (2470 linhas) | — | Não foi possível dividir com segurança |

Os dois arquivos abaixo não foram completamente divididos porque a extração segura requer a criação de módulos intermediários de helpers compartilhados — trabalho estimado em 1–2 dias.

---

## `core/gsheets_backend.py` (2447 linhas)

### Problema

O arquivo contém quatro domínios lógicos distintos, mas todos eles chamam os mesmos helpers privados definidos no topo do arquivo (`_get_col_index`, `_normalize_header_row`, `_read_sheet_as_df`, etc.). Qualquer tentativa de extrair um domínio para um submódulo exigiria que esse submódulo importasse os helpers de `gsheets_backend.py` — e `gsheets_backend.py` importaria do submódulo para re-exportar — criando importação circular.

### Estrutura interna atual

```
gsheets_backend.py
├── helpers privados compartilhados (~600 linhas)
│   ├── _get_col_index, _normalize_header_row, _read_sheet_as_df
│   ├── _write_df_to_sheet, _update_cells_batch, _df_to_rows
│   └── (outros ~20 helpers de baixo nível)
├── domínio: movimentações (~400 linhas)
├── domínio: equipamentos (~350 linhas)
├── domínio: produtos/slots (~500 linhas)
├── domínio: plano de endereçamento (~400 linhas)
└── domínio: versões → já extraído para gsheets_versions.py
```

### Solução proposta

1. Criar `core/gsheets_helpers.py` com os ~600 linhas de helpers privados compartilhados
2. Importar `gsheets_helpers` em `gsheets_backend.py` (sem re-exportar)
3. Opcionalmente, extrair cada domínio para `gsheets_moves.py`, `gsheets_equipment.py`, etc.
4. `gsheets_backend.py` vira uma fachada de re-exportação (~50 linhas)

**Risco:** Os helpers usam `GSheetsClient` diretamente — garantir que `gsheets_helpers.py` não crie dependência circular com `gsheets_client.py`.

---

## `core/initial_data.py` (2470 linhas)

### Problema

O arquivo mistura três responsabilidades que compartilham funções privadas intermediárias:

1. **Builder de HTML** — monta o HTML do relatório de endereçamento
2. **Computação de métricas** — calcula ocupação, curva ABC, etc.
3. **Processamento de dados** — lê e normaliza os dados de entrada

As funções de métricas chamam os helpers de processamento; o builder HTML chama funções de métricas. Extrair qualquer uma das três partes isola causa importação circular ou duplicação de helpers.

### Solução proposta

1. Criar `core/initial_data_metrics.py` com as funções puras de cálculo (sem I/O)
2. Criar `core/initial_data_html.py` com o builder de HTML (importa de `metrics`)
3. `initial_data.py` mantém apenas as funções de leitura/entrada e importa de ambos
4. Helpers compartilhados de baixo nível podem ir para `core/utils.py` se forem genéricos o suficiente

**Risco:** O builder HTML usa pandas DataFrames passados pelas funções de métricas — garantir que a fronteira entre os módulos não passe objetos muito acoplados.

---

## Critério de aceite

- Nenhum módulo em `core/` com mais de 800 linhas
- Zero importações circulares (verificar com `python -c "import core"`)
- Todos os testes existentes passando após o refactor (`pytest tests/ -x`)
- Imports externos não quebram (usar fachada de re-exportação quando necessário)
