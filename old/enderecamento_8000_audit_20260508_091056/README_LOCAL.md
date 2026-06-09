# Endereçamento Local (FastAPI)

Este modo permite rodar o Dashboard localmente com o mesmo HTML e uma API substituindo o Apps Script, além de habilitar testes automatizados.

## Requisitos

- Python 3.11+

## Instalação

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Executar o servidor

```bash
uvicorn app:app --reload --port 8000
```

Abra no navegador:

```
http://localhost:8000
```

Por padrão o servidor usa:

```
ETL/ENDERECAMENTO_DARK_PINHEIROS (teste) (2).xlsx
```

Se quiser apontar para outra planilha:

```bash
ENDERECAMENTO_XLSX="/caminho/arquivo.xlsx" uvicorn app:app --reload --port 8000
```

## Testes

```bash
pytest -q
```

- `tests/test_filters.py`: valida filtros principais.
- `tests/test_order.py`: valida ordenação e agrupamento.
- `tests/test_initial_data_smoke.py`: smoke test do `getInitialData`.

## Observações

- Algumas funções do Apps Script (cadastro/remoção em massa e gerenciamento de equipamentos) não estão implementadas no modo local.
- Botões correspondentes são desabilitados automaticamente quando o HTML detecta o modo local.
