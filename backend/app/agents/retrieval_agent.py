"""Adaptive retrieval across GOV.UK knowledge, semantic memory, and episodic memory."""

from __future__ import annotations

import math
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.database.mongodb_client import semantic_memories_collection
from app.memory.episodic_memory_service import retrieve_episodic_memories_for_user
from app.memory.visa_knowledge_service import retrieve_visa_knowledge_chunks, visa_chunks_for_prompt
from app.services.embedding_service import cosine_similarity, embed_text
from app.services.llm_service import get_chat_model, message_text

MEMORY_DECISION_SYSTEM = """You decide which context should be used for answering. Use GOV.UK context for factual rules, semantic memory for learned strategies, episodic memory for past user interactions, and user profile for personalisation—including tone, psychological cues, and stated situation (e.g. applying from outside the UK vs already in the UK) when choosing grounding and what to emphasise. Return a short retrieval decision (2–4 sentences) explaining which sources were prioritised and why."""


def _keyword_boost_tags(query_lower: str, tags: list[str]) -> float:
    boost = 0.0
    tag_blob = " ".join(tags or []).lower()
    if "document" in query_lower or "documents" in query_lower:
        if "document" in tag_blob or "evidence" in tag_blob:
            boost += 0.06
    if "sponsor" in query_lower:
        if "sponsor" in tag_blob:
            boost += 0.06
    return boost


def _score_semantic_memory(
    query_embedding: list[float],
    query_lower: str,
    document: dict[str, Any],
) -> float:
    embedding = document.get("embedding") or []
    if not embedding:
        return 0.0
    base_similarity = cosine_similarity(query_embedding, embedding)
    average_improvement = float(document.get("average_score_improvement") or 0.0)
    improvement_boost = min(0.12, max(0.0, average_improvement) * 0.04)
    usage_count = int(document.get("usage_count") or 0)
    usage_boost = min(0.08, math.log(usage_count + 1) * 0.018)
    tag_boost = _keyword_boost_tags(query_lower, list(document.get("tags") or []))
    return base_similarity + improvement_boost + usage_boost + tag_boost


def _pick_semantic_memories_adaptive(
    user_query: str,
    *,
    top_k: int = 6,
) -> list[dict[str, Any]]:
    query_embedding = embed_text(user_query)
    query_lower = user_query.lower()
    collection = semantic_memories_collection()
    cursor = collection.find(
        {},
        {
            "memory_id": 1,
            "situation": 1,
            "learned_strategy": 1,
            "tags": 1,
            "source_query": 1,
            "embedding": 1,
            "usage_count": 1,
            "average_score_improvement": 1,
        },
    ).limit(220)

    scored: list[tuple[float, dict[str, Any]]] = []
    for document in cursor:
        try:
            combined_score = _score_semantic_memory(query_embedding, query_lower, document)
        except Exception:
            continue
        scored.append((combined_score, document))
    scored.sort(key=lambda item: item[0], reverse=True)

    results: list[dict[str, Any]] = []
    for combined_score, document in scored[:top_k]:
        memory_id = str(document.get("memory_id", ""))
        situation = document.get("situation", "")
        strategy = document.get("learned_strategy", "")
        tags = list(document.get("tags") or [])
        reason_parts: list[str] = []
        if float(document.get("average_score_improvement") or 0.0) > 0:
            reason_parts.append("boosted for proven score lift")
        if int(document.get("usage_count") or 0) > 0:
            reason_parts.append("reused strategies get a modest usage boost")
        if _keyword_boost_tags(query_lower, tags) > 0:
            reason_parts.append("keyword alignment with query theme")
        selection_reason = "; ".join(reason_parts) if reason_parts else "high semantic similarity to query"
        results.append(
            {
                "memory_id": memory_id,
                "situation": situation,
                "learned_strategy": strategy,
                "tags": tags,
                "source_query": document.get("source_query", ""),
                "combined_score": round(float(combined_score), 4),
                "selection_reason": selection_reason,
            }
        )
    return results


def _derive_weights_and_reason(
    previous_evaluation: dict[str, Any] | None,
    query_lower: str,
) -> tuple[dict[str, float], str]:
    govuk_weight = 0.55
    semantic_weight = 0.30
    episodic_weight = 0.15
    reasons: list[str] = []

    if previous_evaluation:
        accuracy = float(previous_evaluation.get("accuracy") or 0)
        completeness = float(previous_evaluation.get("completeness") or 0)
        actionability = float(previous_evaluation.get("actionability") or 0)
        if accuracy < 3:
            govuk_weight = 0.70
            semantic_weight = 0.22
            episodic_weight = 0.08
            reasons.append("prior answer accuracy was weak; prioritising GOV.UK chunks")
        if completeness < 3 or actionability < 3:
            govuk_weight -= 0.08
            semantic_weight += 0.08
            reasons.append("prior answer lacked completeness or action steps; boosting learned strategies")

    if "document" in query_lower or "sponsor" in query_lower:
        semantic_weight += 0.05
        govuk_weight -= 0.03
        episodic_weight -= 0.02
        reasons.append("query mentions documents or sponsorship; semantic matches were boosted")

    total = govuk_weight + semantic_weight + episodic_weight
    govuk_weight = round(govuk_weight / total, 2)
    semantic_weight = round(semantic_weight / total, 2)
    episodic_weight = round(1.0 - govuk_weight - semantic_weight, 2)

    reason_text = " ".join(reasons) if reasons else "balanced adaptive weighting across sources"
    return (
        {
            "govuk_context": govuk_weight,
            "semantic_memory": semantic_weight,
            "episodic_memory": episodic_weight,
        },
        reason_text,
    )


def generate_retrieval_decision_summary(
    user_query: str,
    user_profile: dict[str, Any],
    govuk_chunks: list[dict[str, Any]],
    semantic_memories: list[dict[str, Any]],
    episodic_memories: list[dict[str, Any]],
    turn_intent_hints: list[str] | None = None,
    turn_tone_markers: list[str] | None = None,
    turn_situation_hints: list[str] | None = None,
) -> str:
    llm = get_chat_model(temperature=0.15)
    profile_view = {
        "goal": user_profile.get("goal"),
        "preferred_style": user_profile.get("preferred_style"),
        "topic_tags": (user_profile.get("topic_tags") or [])[:20],
        "persona_bullets": (user_profile.get("persona_bullets") or [])[:12],
        "tone_history": (user_profile.get("tone_history") or [])[-12:],
        "psychological_notes": (user_profile.get("psychological_notes") or [])[:10],
        "uk_presence": user_profile.get("uk_presence"),
        "nationality": user_profile.get("nationality"),
        "current_location": user_profile.get("current_location"),
        "mentioned_facts": (user_profile.get("mentioned_facts") or [])[:10],
    }
    if turn_intent_hints:
        profile_view["this_turn_visa_topic_hints"] = turn_intent_hints[:10]
    if turn_tone_markers:
        profile_view["this_turn_tone_markers"] = turn_tone_markers[:10]
    if turn_situation_hints:
        profile_view["this_turn_situation_hints"] = turn_situation_hints[:8]

    summary_payload = (
        f"User query: {user_query}\n\n"
        f"User profile (structured): {profile_view}\n\n"
        f"GOV.UK chunks retrieved: {len(govuk_chunks)}\n"
        f"Semantic memories retrieved: {len(semantic_memories)}\n"
        f"Episodic memories retrieved: {len(episodic_memories)}\n"
    )
    response = llm.invoke(
        [
            SystemMessage(content=MEMORY_DECISION_SYSTEM),
            HumanMessage(content=summary_payload),
        ]
    )
    return message_text(response.content)


def run_adaptive_retrieval(
    user_query: str,
    user_id: str,
    user_profile: dict[str, Any],
    *,
    previous_evaluation: dict[str, Any] | None = None,
    turn_intent_hints: list[str] | None = None,
    turn_tone_markers: list[str] | None = None,
    turn_situation_hints: list[str] | None = None,
) -> dict[str, Any]:
    query_lower = user_query.lower()
    accuracy_score = float(previous_evaluation.get("accuracy", 5) or 0) if previous_evaluation else 5.0
    govuk_top_k = 10 if accuracy_score < 3 else 7

    govuk_raw = retrieve_visa_knowledge_chunks(user_query, top_k=govuk_top_k)
    govuk_for_prompt = visa_chunks_for_prompt(govuk_raw)

    semantic_hits = _pick_semantic_memories_adaptive(user_query, top_k=7)
    episodic_hits = retrieve_episodic_memories_for_user(user_id, user_query, top_k=6)

    weights, programmatic_reason = _derive_weights_and_reason(previous_evaluation, query_lower)

    llm_reason = generate_retrieval_decision_summary(
        user_query,
        user_profile,
        govuk_for_prompt,
        semantic_hits,
        episodic_hits,
        turn_intent_hints=turn_intent_hints,
        turn_tone_markers=turn_tone_markers,
        turn_situation_hints=turn_situation_hints,
    )
    merged_reason = f"{programmatic_reason} {llm_reason}".strip()

    trace = {
        "strategy": "adaptive_memory_weighted",
        "govuk_chunks_found": len(govuk_for_prompt),
        "semantic_memories_found": len(semantic_hits),
        "episodic_memories_found": len(episodic_hits),
        "weights": weights,
        "reason": merged_reason,
        "programmatic_reason": programmatic_reason,
        "llm_reason": llm_reason,
        "govuk_top_k": govuk_top_k,
        "prior_answer_accuracy": accuracy_score,
        "govuk_top_k_rationale": (
            "Expanded GOV.UK recall because the prior answer scored low on accuracy (<3/5)."
            if accuracy_score < 3
            else "Standard GOV.UK recall for balanced grounding."
        ),
        "turn_intent_hints": list(turn_intent_hints or []),
        "turn_tone_markers": list(turn_tone_markers or []),
        "turn_situation_hints": list(turn_situation_hints or []),
    }

    retrieved_memories_for_api: list[dict[str, Any]] = []
    for memory in semantic_hits:
        retrieved_memories_for_api.append(
            {
                "memory_id": memory.get("memory_id", ""),
                "situation": memory.get("situation", ""),
                "learned_strategy": memory.get("learned_strategy", ""),
                "tags": memory.get("tags", []),
                "relevance_score": memory.get("combined_score", 0.0),
                "selection_reason": memory.get("selection_reason", ""),
            }
        )

    return {
        "govuk_chunks_prompt": govuk_for_prompt,
        "govuk_chunks_raw": govuk_raw,
        "semantic_memories": semantic_hits,
        "episodic_memories": episodic_hits,
        "retrieval_trace": trace,
        "retrieved_memories": retrieved_memories_for_api,
    }
