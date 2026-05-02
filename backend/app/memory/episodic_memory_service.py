"""Episodic interaction storage."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.database.mongodb_client import episodic_memories_collection
from app.services.embedding_service import cosine_similarity, embed_text


def record_episodic_memory(
    *,
    interaction_id: str,
    user_id: str,
    query: str,
    answer: str,
    score: int,
    missing_points: list[str],
    memories_used: list[str],
) -> str:
    document = {
        "interaction_id": interaction_id,
        "user_id": user_id,
        "query": query,
        "answer": answer,
        "score": int(score),
        "missing_points": list(missing_points or []),
        "memories_used": list(memories_used or []),
        "created_at": datetime.now(timezone.utc),
    }
    episodic_memories_collection().insert_one(document)
    return interaction_id


def list_episodic_for_user(user_id: str, *, limit: int = 50) -> list[dict[str, Any]]:
    """Recent episodic rows for a user (newest first), for demos / transparency."""
    safe_limit = max(1, min(limit, 200))
    cursor = (
        episodic_memories_collection()
        .find({"user_id": user_id})
        .sort("created_at", -1)
        .limit(safe_limit)
    )
    rows: list[dict[str, Any]] = []
    for document in cursor:
        document.pop("_id", None)
        rows.append(document)
    return rows


def retrieve_episodic_memories_for_user(
    user_id: str,
    query: str,
    *,
    top_k: int = 4,
) -> list[dict[str, Any]]:
    collection = episodic_memories_collection()
    query_embedding = embed_text(query)
    cursor = collection.find({"user_id": user_id}).sort("created_at", -1).limit(80)
    scored: list[tuple[float, dict[str, Any]]] = []
    for document in cursor:
        combined = f"{document.get('query', '')}\n{document.get('answer', '')}"
        interaction_embedding = embed_text(combined[:4000])
        similarity = cosine_similarity(query_embedding, interaction_embedding)
        scored.append((similarity, document))
    scored.sort(key=lambda item: item[0], reverse=True)
    results: list[dict[str, Any]] = []
    for similarity, document in scored[:top_k]:
        results.append(
            {
                "interaction_id": document.get("interaction_id", ""),
                "query": document.get("query", ""),
                "answer": document.get("answer", ""),
                "score": int(document.get("score") or 0),
                "similarity": round(float(similarity), 4),
                "missing_points": document.get("missing_points", []),
                "memories_used": document.get("memories_used", []),
            }
        )
    return results
