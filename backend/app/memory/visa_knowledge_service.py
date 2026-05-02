"""Retrieve Skilled Worker knowledge chunks with vector similarity fallback."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.database.mongodb_client import visa_knowledge_collection
from app.services.embedding_service import cosine_similarity, embed_text

DEFAULT_TOP_K = 6
# Scan cap for in-memory cosine ranking (no vector index). Raise after larger ingests.
MAX_SCAN = 1200

# Frontend/backend must send this exact string to purge the visa_knowledge collection.
KNOWLEDGE_PURGE_CONFIRM_PHRASE = "DELETE_ALL_VISA_KNOWLEDGE"


def _serialize_datetime(value: object | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def list_knowledge_chunks(
    *,
    offset: int = 0,
    limit: int = 50,
    search: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Paginated knowledge rows for admin UI (embeddings omitted; dimensions only)."""
    collection = visa_knowledge_collection()
    query_filter: dict[str, Any] = {}
    if search and search.strip():
        term = search.strip()
        query_filter["$or"] = [
            {"content": {"$regex": term, "$options": "i"}},
            {"title": {"$regex": term, "$options": "i"}},
            {"source_url": {"$regex": term, "$options": "i"}},
            {"chunk_id": {"$regex": term, "$options": "i"}},
        ]

    total = collection.count_documents(query_filter)
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)

    pipeline: list[dict[str, Any]] = [
        {"$match": query_filter},
        {"$sort": {"last_checked_at": -1, "source_url": 1, "chunk_id": 1}},
        {"$skip": safe_offset},
        {"$limit": safe_limit},
        {
            "$project": {
                "_id": 0,
                "chunk_id": 1,
                "title": 1,
                "visa_route": 1,
                "content": 1,
                "source_url": 1,
                "last_checked_at": 1,
                "embedding_dimensions": {
                    "$cond": [
                        {"$isArray": "$embedding"},
                        {"$size": "$embedding"},
                        0,
                    ]
                },
                "has_embedding": {
                    "$gt": [
                        {
                            "$cond": [
                                {"$isArray": "$embedding"},
                                {"$size": "$embedding"},
                                0,
                            ]
                        },
                        0,
                    ]
                },
            }
        },
    ]

    rows = list(collection.aggregate(pipeline))
    for row in rows:
        row["last_checked_at"] = _serialize_datetime(row.get("last_checked_at"))
        row["embedding_dimensions"] = int(row.get("embedding_dimensions") or 0)
        row["has_embedding"] = bool(row.get("has_embedding"))
    return rows, total


def get_knowledge_chunk_detail(chunk_id: str) -> dict[str, Any] | None:
    """Single chunk with citation fields and a short embedding preview (not full vector)."""
    collection = visa_knowledge_collection()
    document = collection.find_one({"chunk_id": chunk_id})
    if not document:
        return None

    embedding = document.pop("embedding", None) or []
    document.pop("_id", None)

    preview_length = 16
    embedding_preview = [round(float(value), 6) for value in embedding[:preview_length]]

    detail = {
        "chunk_id": document.get("chunk_id", ""),
        "title": document.get("title", ""),
        "visa_route": document.get("visa_route", ""),
        "content": document.get("content", ""),
        "source_url": document.get("source_url", ""),
        "last_checked_at": _serialize_datetime(document.get("last_checked_at")),
        "embedding_dimensions": len(embedding),
        "has_embedding": len(embedding) > 0,
        "embedding_preview": embedding_preview,
        "embedding_preview_note": f"First {min(preview_length, len(embedding))} dimensions shown; full vector stored in MongoDB.",
        "citation": {
            "label": document.get("title", "GOV.UK"),
            "url": document.get("source_url", ""),
            "route": document.get("visa_route", ""),
        },
    }
    return detail


def knowledge_store_stats() -> dict[str, Any]:
    collection = visa_knowledge_collection()
    total_chunks = collection.count_documents({})
    pipeline = [
        {"$group": {"_id": "$source_url", "chunks": {"$sum": 1}}},
        {"$sort": {"chunks": -1}},
    ]
    per_url = list(collection.aggregate(pipeline))
    return {
        "total_chunks": total_chunks,
        "unique_source_urls": len(per_url),
        "chunks_by_url": [{"source_url": row["_id"], "chunk_count": row["chunks"]} for row in per_url],
    }


def purge_all_visa_knowledge_chunks() -> int:
    """Remove every document from visa_knowledge. Returns deleted row count."""
    collection = visa_knowledge_collection()
    result = collection.delete_many({})
    return int(result.deleted_count)


def retrieve_visa_knowledge_chunks(query: str, top_k: int = DEFAULT_TOP_K) -> list[dict[str, Any]]:
    collection = visa_knowledge_collection()
    query_embedding = embed_text(query)
    cursor = collection.find(
        {},
        {
            "chunk_id": 1,
            "title": 1,
            "visa_route": 1,
            "content": 1,
            "source_url": 1,
            "embedding": 1,
        },
    ).limit(MAX_SCAN)
    scored: list[tuple[float, dict[str, Any]]] = []
    for document in cursor:
        embedding = document.get("embedding") or []
        if not embedding:
            continue
        similarity = cosine_similarity(query_embedding, embedding)
        scored.append((similarity, document))
    scored.sort(key=lambda item: item[0], reverse=True)
    results: list[dict[str, Any]] = []
    for similarity, document in scored[:top_k]:
        results.append(
            {
                "chunk_id": document.get("chunk_id", ""),
                "title": document.get("title", ""),
                "visa_route": document.get("visa_route", ""),
                "content": document.get("content", ""),
                "source_url": document.get("source_url", ""),
                "similarity": round(float(similarity), 4),
            }
        )
    return results


def visa_chunks_for_prompt(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    formatted: list[dict[str, Any]] = []
    for chunk in chunks:
        formatted.append(
            {
                "title": chunk.get("title", ""),
                "url": chunk.get("source_url", ""),
                "text": chunk.get("content", ""),
            }
        )
    return formatted
