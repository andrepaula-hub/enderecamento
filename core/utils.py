from __future__ import annotations

import html
import re
from typing import Any

import numpy as np
import pandas as pd


def escape_html(value: Any) -> str:
    if value is None:
        return ""
    return html.escape(str(value), quote=True)


def parse_bool_flag(value: Any) -> bool:
    if value is True:
        return True
    if value is False or value is None:
        return False
    normalized = str(value).strip().lower()
    if not normalized:
        return False
    return normalized in {"true", "sim", "yes", "y", "1"}


def parse_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    text = text.replace("\u00a0", "").replace(" ", "")
    text = re.sub(r"[^0-9,.\-+]", "", text)
    if not text:
        return None
    has_comma = "," in text
    has_dot = "." in text
    if has_comma and has_dot:
        last_comma = text.rfind(",")
        last_dot = text.rfind(".")
        if last_comma > last_dot:
            text = text.replace(".", "")
            text = text.replace(",", ".")
        else:
            text = text.replace(",", "")
    elif has_comma:
        text = text.replace(",", ".")
    if text.count(".") > 1:
        last_dot = text.rfind(".")
        text = text[:last_dot].replace(".", "") + text[last_dot:]
    try:
        return float(text)
    except ValueError:
        return None


def to_python_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (np.integer, np.int64)):
        return int(value)
    if isinstance(value, (np.floating, np.float64)):
        return float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, pd.Timestamp):
        return value.to_pydatetime()
    return value


def normalize_string(value: Any) -> str:
    return str(value or "").strip()
