"""Normalize outgoing payloads so FastAPI can JSON-encode nested structures."""

from __future__ import annotations

from typing import Any

from fastapi.encoders import jsonable_encoder


def encode_json_safe_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Convert datetime, ObjectId, etc. inside loosely typed dicts to JSON-safe values."""
    encoded = jsonable_encoder(payload)
    if not isinstance(encoded, dict):
        raise TypeError("Expected a dict payload for API encoding.")
    return encoded
