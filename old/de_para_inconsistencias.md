
## Análise atual (de_para_layout_revisado.xlsx)
### OK / Esperado
- 3 linhas marcadas como **NAO EXISTE MAIS** (esperado).
- Nenhum duplicado de endereço antigo.
- Nenhum duplicado de endereço novo.
- Nenhum conflito (novo recebendo múltiplos antigos).
- Nenhum endereço antigo inexistente no cadastro antigo.
- Nenhum endereço antigo existente sem mapeamento.
- Nenhum endereço novo existente sem mapeamento.

### Inconsistências restantes
**Endereços novos no de/para que NÃO existem no cadastro novo (10):**
- R2-030
- R2-032
- R2-034
- R2-036
- R2-038
- R2-040
- R2-042
- R2-044
- R2-046
- R2-048

Se esses endereços realmente não existem mais no layout novo, o de/para está correto e basta removê-los do cadastro/endereçamento (ou manter como “NAO EXISTE MAIS”).
Se eles deveriam existir, então falta atualizar o **Cadastro_Equipamentos** e/ou o **Plano_Enderecamento_Final** do layout novo.

- que? nao lembro de ter falado que a rua 3 nao deve comecar com 1 /2 no enderecamento atual, isso nao faz nem sentindo
