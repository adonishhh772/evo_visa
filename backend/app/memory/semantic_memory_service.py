"""Semantic memory persistence and boosting metadata updates."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId

from app.database.mongodb_client import semantic_memories_collection
from app.services.embedding_service import embed_text


def insert_semantic_memory(record: dict[str, Any]) -> str:
    collection = semantic_memories_collection()
    embedding_source = record.get("embedding_text") or (
        f"{record.get('situation', '')}\n{record.get('learned_strategy', '')}\n"
        f"{' '.join(record.get('tags', []) or [])}"
    )
    embedding = embed_text(embedding_source[:8000])
    document = {
        "memory_id": record["memory_id"],
        "situation": record.get("situation", ""),
        "learned_strategy": record.get("learned_strategy", ""),
        "tags": list(record.get("tags") or []),
        "source_query": record.get("source_query", ""),
        "embedding_text": embedding_source[:8000],
        "embedding": embedding,
        "usage_count": int(record.get("usage_count") or 0),
        "average_score_improvement": float(record.get("average_score_improvement") or 0.0),
        "last_used_at": record.get("last_used_at"),
        "created_at": record.get("created_at") or datetime.now(timezone.utc),
    }
    collection.insert_one(document)
    return document["memory_id"]


def record_semantic_memory_usage(memory_ids: list[str]) -> None:
    """Increment usage_count when memories were retrieved in chat.

    Chat has no fair baseline vs memory-off control, so we must **not** blend a fake ``0.0``
    improvement into ``average_score_improvement`` — that drags demo-derived lifts toward zero
    and makes retrieval think memories stopped helping.
    """
    collection = semantic_memories_collection()
    now = datetime.now(timezone.utc)
    for memory_id in memory_ids:
        if not memory_id:
            continue
        document = collection.find_one({"memory_id": memory_id})
        if not document:
            try:
                if ObjectId.is_valid(memory_id):
                    document = collection.find_one({"_id": ObjectId(memory_id)})
            except Exception:
                document = None
        if not document:
            continue
        filter_query = {"memory_id": document.get("memory_id", memory_id)}
        collection.update_one(
            filter_query,
            {
                "$inc": {"usage_count": 1},
                "$set": {"last_used_at": now},
            },
        )


def update_memory_effectiveness(memory_ids: list[str], improvement_delta: float) -> None:
    """Update rolling improvement stats when a **measured** delta exists (e.g. demo fair A/B)."""
    collection = semantic_memories_collection()
    for memory_id in memory_ids:
        if not memory_id:
            continue
        document = collection.find_one({"memory_id": memory_id})
        if not document:
            try:
                if ObjectId.is_valid(memory_id):
                    document = collection.find_one({"_id": ObjectId(memory_id)})
            except Exception:
                document = None
        if not document:
            continue
        filter_query = {"memory_id": document.get("memory_id", memory_id)}
        prior_count = int(document.get("usage_count") or 0)
        prior_avg = float(document.get("average_score_improvement") or 0.0)
        new_count = prior_count + 1
        new_avg = ((prior_avg * prior_count) + improvement_delta) / max(new_count, 1)
        collection.update_one(
            filter_query,
            {
                "$set": {
                    "usage_count": new_count,
                    "average_score_improvement": round(new_avg, 4),
                    "last_used_at": datetime.now(timezone.utc),
                }
            },
        )


def list_semantic_memories(limit: int = 100) -> list[dict[str, Any]]:
    collection = semantic_memories_collection()
    rows: list[dict[str, Any]] = []
    for document in collection.find({}, {"embedding": 0}).sort("created_at", -1).limit(limit):
        document.pop("_id", None)
        rows.append(document)
    return rows
