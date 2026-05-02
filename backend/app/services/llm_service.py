"""Shared LangChain chat model factory."""

from __future__ import annotations

from langchain_openai import ChatOpenAI

from app.config import OPENAI_API_KEY, OPENAI_CHAT_MODEL


def get_chat_model(
    *,
    temperature: float = 0.2,
    response_format: dict[str, str] | None = None,
) -> ChatOpenAI:
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is required.")
    model_kwargs: dict[str, object] = {}
    if response_format:
        model_kwargs["response_format"] = response_format
    return ChatOpenAI(
        api_key=OPENAI_API_KEY,
        model=OPENAI_CHAT_MODEL,
        temperature=temperature,
        model_kwargs=model_kwargs or {},
    )


def message_text(content: object) -> str:
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for block in content or []:
        if isinstance(block, dict) and block.get("type") == "text":
            parts.append(str(block.get("text", "")))
        else:
            parts.append(str(block))
    return "".join(parts)
