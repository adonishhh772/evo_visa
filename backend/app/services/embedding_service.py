"""OpenAI embedding helpers."""

from __future__ import annotations

from langchain_openai import OpenAIEmbeddings

from app.config import OPENAI_API_KEY, OPENAI_EMBEDDING_MODEL


def get_embeddings_client() -> OpenAIEmbeddings:
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is required for embeddings.")
    return OpenAIEmbeddings(api_key=OPENAI_API_KEY, model=OPENAI_EMBEDDING_MODEL)


def embed_text(text: str) -> list[float]:
    cleaned = (text or "").strip()
    if not cleaned:
        return []
    client = get_embeddings_client()
    vector = client.embed_query(cleaned[:8000])
    return list(vector)


def cosine_similarity(vector_a: list[float], vector_b: list[float]) -> float:
    if not vector_a or not vector_b or len(vector_a) != len(vector_b):
        return 0.0
    dot_product = sum(a * b for a, b in zip(vector_a, vector_b))
    magnitude_a = sum(a * a for a in vector_a) ** 0.5
    magnitude_b = sum(b * b for b in vector_b) ** 0.5
    if magnitude_a == 0 or magnitude_b == 0:
        return 0.0
    return dot_product / (magnitude_a * magnitude_b)
