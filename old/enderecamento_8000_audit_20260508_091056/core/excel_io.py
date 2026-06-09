from __future__ import annotations

from pathlib import Path
from typing import Any

import pandas as pd

from .utils import to_python_value


def read_sheet(path: Path, sheet_name: str) -> list[dict[str, Any]]:
    df = pd.read_excel(path, sheet_name=sheet_name, dtype=object)
    df.columns = [str(col).strip() if col is not None else "" for col in df.columns]
    valid_cols = [col for col in df.columns if col]
    if not valid_cols:
        return []
    df = df[valid_cols]
    df = df.where(pd.notnull(df), None)
    records = df.to_dict(orient="records")
    cleaned: list[dict[str, Any]] = []
    for record in records:
        cleaned.append({key: to_python_value(value) for key, value in record.items()})
    return cleaned
