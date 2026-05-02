"""Knowledge base browsing and ingest helpers for the admin UI."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.config import OPENAI_EMBEDDING_MODEL
from app.ingestion.govuk_ingestion import DEFAULT_SKILLED_WORKER_URLS
from app.logging_setup import get_logger
from app.memory.visa_knowledge_service import (
    KNOWLEDGE_PURGE_CONFIRM_PHRASE,
    get_knowledge_chunk_detail,
    knowledge_store_stats,
    list_knowledge_chunks,
    purge_all_visa_knowledge_chunks,
)
from app.schemas.request_models import KnowledgePurgeRequest
from app.schemas.response_models import KnowledgePurgeResponse

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])
logger = get_logger("routes.knowledge")


@router.get("/meta")
def knowledge_meta() -> dict[str, Any]:
    """Defaults and embedding configuration for the frontend knowledge console."""
    return {
        "default_govuk_urls": list(DEFAULT_SKILLED_WORKER_URLS),
        "embedding_model": OPENAI_EMBEDDING_MODEL,
        "visa_route_focus": "Skilled Worker",
        "purge_confirm_phrase": KNOWLEDGE_PURGE_CONFIRM_PHRASE,
    }


@router.get("/stats")
def knowledge_stats() -> dict[str, Any]:
    try:
        stats = knowledge_store_stats()
        stats["embedding_model"] = OPENAI_EMBEDDING_MODEL
        return stats
    except Exception as exc:
        logger.exception("knowledge_stats_failed")
        raise HTTPException(status_code=500, detail=f"Stats failed: {exc}") from exc


@router.get("/chunks")
def knowledge_chunks(
    offset: int = Query(0, ge=0),
    limit: int = Query(40, ge=1, le=200),
    q: str | None = Query(None, description="Search title, URL, chunk id, or body text"),
) -> dict[str, Any]:
    try:
        rows, total = list_knowledge_chunks(offset=offset, limit=limit, search=q)
        return {
            "chunks": rows,
            "total": total,
            "offset": offset,
            "limit": limit,
            "embedding_model": OPENAI_EMBEDDING_MODEL,
        }
    except Exception as exc:
        logger.exception("knowledge_chunks_list_failed")
        raise HTTPException(status_code=500, detail=f"Failed to list chunks: {exc}") from exc


@router.post("/purge", response_model=KnowledgePurgeResponse)
def knowledge_purge_all(payload: KnowledgePurgeRequest) -> KnowledgePurgeResponse:
    """Delete every chunk in visa_knowledge (requires explicit confirmation phrase)."""
    if payload.confirm.strip() != KNOWLEDGE_PURGE_CONFIRM_PHRASE:
        raise HTTPException(
            status_code=400,
            detail=(
                "Confirmation phrase mismatch. "
                f"Send confirm: \"{KNOWLEDGE_PURGE_CONFIRM_PHRASE}\" exactly."
            ),
        )
    try:
        deleted_count = purge_all_visa_knowledge_chunks()
        logger.warning("visa_knowledge_purged deleted_count=%s", deleted_count)
        return KnowledgePurgeResponse(status="success", deleted_count=deleted_count)
    except Exception as exc:
        logger.exception("knowledge_purge_failed")
        raise HTTPException(status_code=500, detail=f"Purge failed: {exc}") from exc


@router.get("/chunks/{chunk_id}")
def knowledge_chunk_detail(chunk_id: str) -> dict[str, Any]:
    try:
        detail = get_knowledge_chunk_detail(chunk_id)
    except Exception as exc:
        logger.exception("knowledge_chunk_detail_failed chunk_id=%s", chunk_id)
        raise HTTPException(status_code=500, detail=f"Failed to load chunk: {exc}") from exc
    if not detail:
        raise HTTPException(status_code=404, detail="Chunk not found.")
    detail["embedding_model"] = OPENAI_EMBEDDING_MODEL
    return detail
