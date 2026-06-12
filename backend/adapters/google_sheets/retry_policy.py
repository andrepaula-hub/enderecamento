from __future__ import annotations

import logging
import time
from typing import Callable, TypeVar

logger = logging.getLogger("enderecamento.retry")
T = TypeVar("T")

RETRYABLE_STATUS = {429, 500, 502, 503, 504}


def with_retry(fn: Callable[[], T], max_attempts: int = 3, base_delay: float = 1.0) -> T:
    """Exponential backoff retry para chamadas Sheets API."""
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as exc:
            # Verifica se é erro HTTP retentável
            status = getattr(getattr(exc, "resp", None), "status", None)
            if status and int(status) not in RETRYABLE_STATUS:
                raise
            if attempt == max_attempts - 1:
                raise
            delay = base_delay * (2 ** attempt)
            logger.warning("Retry %d/%d após erro %s (aguardando %.1fs)", attempt + 1, max_attempts, exc, delay)
            time.sleep(delay)
    raise RuntimeError("Unreachable")
