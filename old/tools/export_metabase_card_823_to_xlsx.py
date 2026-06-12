#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.metabase_sales import (  # noqa: E402
    DEFAULT_CARD_ID,
    DEFAULT_METABASE_URL,
    DEFAULT_TIMEOUT_SECONDS,
    fetch_card_823_rows,
    write_metabase_rows_to_xlsx,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Exporta o card 823 (NOW vendas por dia) do Metabase para XLSX."
    )
    parser.add_argument("--mb-url", default=DEFAULT_METABASE_URL)
    parser.add_argument("--mb-session-id", default="")
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--card-id", type=int, default=DEFAULT_CARD_ID)
    parser.add_argument("--data-inicial", required=True, help="YYYY-MM-DD")
    parser.add_argument("--data-final", required=True, help="YYYY-MM-DD")
    parser.add_argument("--loja", default="", help="Valor da template-tag Loja no Metabase, ex: pamplona")
    parser.add_argument("--cod-loja", default="", help="Codigo interno da loja, ex: LJ060001")
    parser.add_argument("--output", required=True, help="Caminho do arquivo .xlsx de saida")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    resolved_store, rows = fetch_card_823_rows(
        data_inicial=args.data_inicial,
        data_final=args.data_final,
        loja=args.loja,
        cod_loja=args.cod_loja,
        session_id=args.mb_session_id,
        base_url=args.mb_url,
        card_id=args.card_id,
        timeout_seconds=args.timeout_seconds,
    )

    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = (ROOT / output_path).resolve()

    saved_path = write_metabase_rows_to_xlsx(rows, output_path)
    print(f"xlsx_gerado={saved_path}")
    print(f"linhas={len(rows)}")
    print(f"loja={resolved_store}")
    print(f"periodo={args.data_inicial}..{args.data_final}")


if __name__ == "__main__":
    main()
