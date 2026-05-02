"""API response models."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class GovUkIngestResponse(BaseModel):
    status: str
    chunks_inserted: int


class KnowledgePurgeResponse(BaseModel):
    status: str
    deleted_count: int


class RetrievedMemoryItem(BaseModel):
    memory_id: str
    situation: str = ""
    learned_strategy: str = ""
    tags: list[str] = Field(default_factory=list)
    relevance_score: float = 0.0
    selection_reason: str = ""


class DemoRunResponse(BaseModel):
    initial_query: str
    answer_without_memory: str
    score_without_memory: int
    evaluation_without_memory: dict[str, Any] = Field(default_factory=dict)
    learned_memory: dict[str, Any] = Field(default_factory=dict)
    follow_up_query: str
    followup_baseline_answer: str = Field(
        "",
        description="Fair baseline: same follow-up and GOV.UK slice, memories cleared.",
    )
    score_followup_baseline: int = Field(0, description="Evaluator total for fair baseline (0–30).")
    evaluation_followup_baseline: dict[str, Any] = Field(default_factory=dict)
    retrieved_memories: list[dict[str, Any]] = Field(default_factory=list)
    retrieval_trace: dict[str, Any] = Field(default_factory=dict)
    workflow_steps: list[dict[str, Any]] = Field(default_factory=list)
    answer_with_memory: str
    score_with_memory: int
    evaluation_with_memory: dict[str, Any] = Field(default_factory=dict)
    improvement: int = Field(
        ...,
        description="score_with_memory − score_followup_baseline (same question and GOV.UK chunks).",
    )
    improvement_headroom_pct: int = Field(
        0,
        description="Percent of remaining rubric headroom (to 30) captured; capped at 100.",
    )
    conversation_turns: list[dict[str, Any]] = Field(default_factory=list)
    preset_turns_used: bool = Field(False, description="True when server filled multi-turn preset.")
    follow_chain: list[str] = Field(
        default_factory=list,
        description="Ordered user messages after opening (primary follow-up + extras/preset).",
    )
    memory_inventory: dict[str, Any] = Field(
        default_factory=dict,
        description="Full semantic + episodic lists for transparency; retrieved_memories remains the ranked slice.",
    )


class ChatResponse(BaseModel):
    answer: str
    score: int
    retrieved_context: list[dict[str, Any]] = Field(default_factory=list)
    retrieved_memories: list[dict[str, Any]] = Field(default_factory=list)
    learned_memory: dict[str, Any] = Field(default_factory=dict)
    evaluation: dict[str, Any] = Field(default_factory=dict)
    retrieval_trace: dict[str, Any] = Field(default_factory=dict)
    user_profile: dict[str, Any] = Field(
        default_factory=dict,
        description="Persisted row: uk_presence, location/nationality, mentioned_facts, tone/psychology, topic_tags.",
    )
    turn_signals: dict[str, Any] = Field(
        default_factory=dict,
        description="Same-turn fast scan: tone_markers plus visa_topic_hints for grounding.",
    )
    profile_learning_delta: dict[str, Any] = Field(
        default_factory=dict,
        description="LLM merge payload (tone_labels, psychological_notes, trait_bullets, topic_tags, communication_note).",
    )
