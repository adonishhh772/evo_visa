"""MongoDB client singleton and collection accessors."""

from __future__ import annotations

from typing import Any

from pymongo import MongoClient

from app.config import MONGODB_DATABASE_NAME, MONGODB_URI

_client: MongoClient[Any] | None = None


def get_mongo_client() -> MongoClient[Any]:
    global _client
    if _client is None:
        _client = MongoClient(MONGODB_URI)
    return _client


def get_database():
    return get_mongo_client()[MONGODB_DATABASE_NAME]


def visa_knowledge_collection():
    return get_database()["visa_knowledge"]


def semantic_memories_collection():
    return get_database()["semantic_memories"]


def episodic_memories_collection():
    return get_database()["episodic_memories"]


def user_profiles_collection():
    return get_database()["user_profiles"]


def evaluation_runs_collection():
    return get_database()["evaluation_runs"]
