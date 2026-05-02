"""
MongoDB indexes for EvoVisa.

Atlas Vector Search indexes must be created in the Atlas UI or API.
See README for JSON definitions. This module applies regular indexes only.
"""

from __future__ import annotations

from app.database.mongodb_client import (
    episodic_memories_collection,
    evaluation_runs_collection,
    semantic_memories_collection,
    user_profiles_collection,
    visa_knowledge_collection,
)


def ensure_regular_indexes() -> None:
    visa_knowledge_collection().create_index("chunk_id", unique=True)
    visa_knowledge_collection().create_index("visa_route")
    visa_knowledge_collection().create_index("last_checked_at")

    semantic_memories_collection().create_index("memory_id", unique=True)
    semantic_memories_collection().create_index([("created_at", -1)])
    semantic_memories_collection().create_index("tags")

    episodic_memories_collection().create_index("interaction_id", unique=True)
    episodic_memories_collection().create_index("user_id")
    episodic_memories_collection().create_index([("created_at", -1)])

    user_profiles_collection().create_index("user_id", unique=True)

    evaluation_runs_collection().create_index("run_id", unique=True)
    evaluation_runs_collection().create_index("user_id")
    evaluation_runs_collection().create_index([("created_at", -1)])
