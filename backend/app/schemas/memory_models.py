"""Pydantic models for MongoDB documents."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SemanticMemoryDocument(BaseModel):
    memory_id: str
    situation: str
    learned_strategy: str
    tags: list[str] = Field(default_factory=list)
    source_query: str
    embedding_text: str = ""
    embedding: list[float] = Field(default_factory=list)
    usage_count: int = 0
    average_score_improvement: float = 0.0
    last_used_at: datetime | None = None
    created_at: datetime


class EpisodicMemoryDocument(BaseModel):
    interaction_id: str
    user_id: str
    query: str
    answer: str
    score: int
    missing_points: list[str] = Field(default_factory=list)
    memories_used: list[str] = Field(default_factory=list)
    created_at: datetime


class EvaluationRunDocument(BaseModel):
    run_id: str
    user_id: str
    initial_query: str
    follow_up_query: str
    answer_without_memory: str
    answer_with_memory: str
    score_without_memory: int
    score_with_memory: int
    improvement: int
    memories_used: list[str] = Field(default_factory=list)
    retrieval_strategy_used: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
