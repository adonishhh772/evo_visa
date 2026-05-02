"""Format dictionaries as Server-Sent Event lines."""

from __future__ import annotations

import json
from typing import Any

from fastapi.encoders import jsonable_encoder


def format_sse_line(payload: dict[str, Any]) -> str:
    return "data: " + json.dumps(jsonable_encoder(payload), ensure_ascii=False) + "\n\n"
