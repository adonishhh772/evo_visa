"""Application-wide logging configuration."""

from __future__ import annotations

import logging
import sys

from app.config import LOG_LEVEL


def configure_application_logging() -> None:
    """Configure root and library loggers once at process startup."""
    level = getattr(logging, LOG_LEVEL, logging.INFO)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)
    root.addHandler(handler)

    # Reduce noise from overly chatty HTTP clients in normal operation
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)

    logging.getLogger("evo_visa").setLevel(level)


def get_logger(name: str) -> logging.Logger:
    """Namespaced logger under the EvoVisa package."""
    return logging.getLogger(f"evo_visa.{name}")
