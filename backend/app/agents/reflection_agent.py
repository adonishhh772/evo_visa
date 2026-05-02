"""Reflection agent converts evaluation gaps into reusable semantic memory."""

from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.services.llm_service import get_chat_model, message_text

REFLECTION_SYSTEM = """You convert evaluator feedback into one reusable semantic memory. Do not store the whole conversation. Extract a general strategy that can improve future similar answers.

Return JSON only:
{
  "situation": "",
  "learned_strategy": "",
  "tags": [],
  "source_query": ""
}"""


def _extract_json_block(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if not match:
        raise ValueError(f"No JSON found in reflection output: {cleaned[:200]}")
    return json.loads(match.group())


def create_learned_memory_from_evaluation(
    source_query: str,
    answer_text: str,
    evaluation: dict[str, Any],
) -> dict[str, Any]:
    llm = get_chat_model()
    user_content = f"""Source query:
{source_query}

Answer given:
{answer_text}

Evaluation JSON:
{json.dumps(evaluation, ensure_ascii=False)}
"""
    response = llm.invoke(
        [
            SystemMessage(content=REFLECTION_SYSTEM),
            HumanMessage(content=user_content),
        ]
    )
    raw_text = message_text(response.content)
    data = _extract_json_block(raw_text)
    data.setdefault("situation", "")
    data.setdefault("learned_strategy", "")
    data.setdefault("tags", [])
    data["source_query"] = data.get("source_query") or source_query[:500]
    return data
