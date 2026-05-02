"""Read semantic memories and evaluation history."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.database.mongodb_client import evaluation_runs_collection
from app.logging_setup import get_logger
from app.memory.semantic_memory_service import list_semantic_memories
from app.memory.user_profile_service import load_or_create_user_profile
from app.util.json_api import encode_json_safe_payload

router = APIRouter(tags=["memory"])
logger = get_logger("routes.memory")


def _serialize_document(document: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(document)
    oid = cleaned.pop("_id", None)
    if oid is not None:
        cleaned["_id"] = str(oid)
    created = cleaned.get("created_at")
    if hasattr(created, "isoformat"):
        cleaned["created_at"] = created.isoformat()
    updated = cleaned.get("updated_at")
    if hasattr(updated, "isoformat"):
        cleaned["updated_at"] = updated.isoformat()
    last_used = cleaned.get("last_used_at")
    if hasattr(last_used, "isoformat"):
        cleaned["last_used_at"] = last_used.isoformat()
    return cleaned


@router.get("/api/profile")
def get_user_profile(user_id: str = "demo_user") -> dict[str, Any]:
    """Return the evolving personalisation record used by chat (Mongo ``user_profiles``)."""
    try:
        row = load_or_create_user_profile(user_id)
        return {"profile": encode_json_safe_payload(row)}
    except Exception as exc:
        logger.exception("profile_read_failed user_id=%s", user_id)
        raise HTTPException(status_code=500, detail=f"Failed to read profile: {exc}") from exc


@router.get("/api/memories")
def list_learned_memories(limit: int = 100) -> dict[str, Any]:
    try:
        rows = [_serialize_document(memory) for memory in list_semantic_memories(limit=limit)]
        logger.info("memories_list count=%s limit=%s", len(rows), limit)
        return {"memories": rows}
    except Exception as exc:
        logger.exception("memories_list_failed limit=%s", limit)
        raise HTTPException(status_code=500, detail=f"Failed to read memories: {exc}") from exc


@router.get("/api/evaluation-runs")
def list_evaluation_runs(limit: int = 50) -> dict[str, Any]:
    try:
        collection = evaluation_runs_collection()
        cursor = collection.find({}).sort("created_at", -1).limit(limit)
        runs = [_serialize_document(doc) for doc in cursor]
        logger.info("evaluation_runs_list count=%s limit=%s", len(runs), limit)
        return {"evaluation_runs": runs}
    except Exception as exc:
        logger.exception("evaluation_runs_list_failed limit=%s", limit)
        raise HTTPException(status_code=500, detail=f"Failed to read evaluation runs: {exc}") from exc
