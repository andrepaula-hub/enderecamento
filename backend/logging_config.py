from __future__ import annotations

import logging
import sys

from backend.config import LOG_LEVEL


def configure_logging() -> None:
    level = getattr(logging, LOG_LEVEL, logging.INFO)
    logging.basicConfig(
        stream=sys.stdout,
        level=level,
        format='{"time": "%(asctime)s", "level": "%(levelname)s", "logger": "%(name)s", "msg": %(message)s}',
        datefmt="%Y-%m-%dT%H:%M:%SZ",
    )


logger = logging.getLogger("enderecamento")
