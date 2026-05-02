"""Orchestrates the EvoVisa before/after demo and shared harness steps."""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Any

DEMO_PRESET_EXTRA_TURNS: list[str] = [
    (
        "I'm collecting paperwork from abroad for Skilled Worker: which categories usually need originals "
        "versus certified translations, what if my Certificate of Sponsorship shows one start date but my "
        "employment contract shows another, and should I pay the Immigration Health Surcharge before or "
        "after biometrics—or does the order not matter?"
    ),
    (
        "My offer is £42k pro-rata on a four-day week for a role mapped to a SOC code whose going-rate "
        "tables I don't fully follow—how do the general salary thresholds, occupation-code rates, and "
        "part-time or pro-rata hours fit together, and what must I verify with my sponsor before I sign?"
    ),
    (
        "English evidence is messy: I have an overseas degree partly taught in English plus a Medium of "
        "Instruction letter and an expired SELTS-style test from a few years ago—which combinations "
        "Skilled Worker actually recognises, which exemptions are automatic versus 'check the rules', "
        "and what would you insist I verify on GOV.UK before I book a new test?"
    ),
    (
        "I'm applying outside the UK with dependants. If I enter first and my partner and child land weeks "
        "later on linked applications, what breaks if vignette or entry dates don't line up, and how "
        "should we think about BRP collection, sponsor reporting, and keeping a consistent story across "
        "our forms and what the sponsor declares?"
    ),
]

from langsmith import traceable

from app.agents.profile_learning_agent import heuristic_signals, infer_profile_delta_from_turn
from app.agents.reflection_agent import create_learned_memory_from_evaluation
from app.agents.retrieval_agent import run_adaptive_retrieval as retrieve_adaptive_context_bundle
from app.agents.visa_consultant_agent import generate_visa_consultant_answer
from app.database.mongodb_client import evaluation_runs_collection
from app.evaluation.evaluation_harness import run_evaluation
from app.memory.episodic_memory_service import list_episodic_for_user, record_episodic_memory
from app.memory.semantic_memory_service import (
    insert_semantic_memory,
    list_semantic_memories,
    record_semantic_memory_usage,
    update_memory_effectiveness,
)
from app.memory.user_profile_service import apply_profile_delta, load_or_create_user_profile
from app.memory.visa_knowledge_service import retrieve_visa_knowledge_chunks, visa_chunks_for_prompt
from app.util.json_api import encode_json_safe_payload


def _trunc(text: str, max_len: int = 320) -> str:
    cleaned = (text or "").strip()
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1] + "…"


def _demo_memory_inventory(user_id: str) -> dict[str, Any]:
    """Full-store visibility for the demo UI (semantic is global; episodic is per user)."""
    semantic = list_semantic_memories(limit=100)
    episodic = list_episodic_for_user(user_id, limit=80)
    return {
        "semantic_store_count": len(semantic),
        "semantic_records": semantic,
        "episodic_store_count": len(episodic),
        "episodic_records": episodic,
        "note": (
            "Semantic memories are shared strategies (not scoped by user_id). "
            "Episodic rows belong to this session user_id. "
            "retrieved_memories on the follow-up is only the top-ranked subset for that query."
        ),
    }


def _evaluation_step_details(ev: dict[str, Any]) -> dict[str, Any]:
    dims = ["accuracy", "completeness", "clarity", "personalisation", "actionability", "safety"]
    out: dict[str, Any] = {"total_score": ev.get("total_score")}
    for key in dims:
        out[key] = ev.get(key)
    missing = ev.get("missing_points") or []
    out["missing_points"] = list(missing)[:10] if isinstance(missing, list) else []
    out["evaluator_note"] = _trunc(str(ev.get("reason") or ""), 450)
    return out


def _govuk_preview(chunks: list[dict[str, Any]], limit: int = 6) -> dict[str, Any]:
    titles: list[str] = []
    urls: list[str] = []
    for chunk in chunks[:limit]:
        titles.append(str(chunk.get("title") or ""))
        urls.append(str(chunk.get("url") or chunk.get("source_url") or ""))
    return {"titles": titles, "urls": urls}


def _learned_memory_excerpt(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "memory_id": document.get("memory_id"),
        "situation": _trunc(str(document.get("situation") or ""), 450),
        "learned_strategy": _trunc(str(document.get("learned_strategy") or ""), 450),
        "tags": list(document.get("tags") or [])[:16],
        "source_query": _trunc(str(document.get("source_query") or ""), 240),
    }


def _proof_memory_row(mem: dict[str, Any]) -> dict[str, Any]:
    return {
        "memory_id": mem.get("memory_id"),
        "situation": _trunc(str(mem.get("situation") or ""), 280),
        "learned_strategy": _trunc(str(mem.get("learned_strategy") or ""), 280),
        "tags": list(mem.get("tags") or [])[:16],
    }


def _headroom_pct(baseline_score: int, delta: int) -> int:
    """Share of remaining rubric headroom (to 30) captured by a positive memory lift."""
    if delta <= 0:
        return 0
    headroom = max(30 - int(baseline_score), 1)
    return min(100, int(round(100 * delta / headroom)))


def _build_demo_workflow_steps(
    *,
    initial_query: str,
    follow_up_query: str,
    govuk_initial: list[dict[str, Any]],
    answer_opening_govuk_only: str,
    evaluation_opening: dict[str, Any],
    score_opening: int,
    learned_memory: dict[str, Any],
    adaptive_bundle: dict[str, Any],
    answer_followup_govuk_only: str,
    evaluation_followup_govuk_only: dict[str, Any],
    score_followup_govuk_only: int,
    answer_with_memory: str,
    evaluation_with_memory: dict[str, Any],
    score_with_memory: int,
    improvement: int,
    improvement_headroom_pct: int,
    memory_ids_used: list[str],
    retrieval_trace: dict[str, Any],
    extra_dialogue_turns: int,
) -> list[dict[str, Any]]:
    semantic_bundle = adaptive_bundle.get("semantic_memories") or []
    episodic_bundle = adaptive_bundle.get("episodic_memories") or []
    memory_previews = []
    for row in semantic_bundle[:5]:
        if not isinstance(row, dict):
            continue
        memory_previews.append(
            {
                "memory_id": row.get("memory_id"),
                "selection_reason": row.get("selection_reason"),
                "combined_score": row.get("combined_score"),
                "situation": _trunc(str(row.get("situation") or ""), 160),
            }
        )

    steps: list[dict[str, Any]] = [
        {
            "id": "b1",
            "phase": "baseline",
            "title": "Retrieve GOV.UK context (initial query)",
            "agent": "Vector retrieval",
            "summary": (
                f"Pulled {len(govuk_initial)} grounded chunks for the opening question "
                "(visa knowledge index only — no memories yet)."
            ),
            "details": {
                "query": initial_query,
                "chunk_count": len(govuk_initial),
                **_govuk_preview(govuk_initial),
            },
        },
        {
            "id": "b2",
            "phase": "baseline",
            "title": "Generate baseline answer",
            "agent": "Visa consultant",
            "summary": (
                "Consultant model answered using GOV.UK chunks only; semantic and episodic "
                "memories were intentionally empty for this turn."
            ),
            "details": {
                "answer_preview": _trunc(answer_opening_govuk_only, 420),
                "answer_char_count": len(answer_opening_govuk_only or ""),
                "context_mode": "govuk_only_no_memory",
            },
        },
        {
            "id": "b3",
            "phase": "baseline",
            "title": "Evaluate opening answer",
            "agent": "Evaluator",
            "summary": (
                f"Automated rubric scored this turn at {score_opening}/30 total — "
                "this drives what the reflection agent learns next."
            ),
            "details": _evaluation_step_details(evaluation_opening),
        },
        {
            "id": "l1",
            "phase": "learning",
            "title": "Reflect & persist semantic memory",
            "agent": "Reflection",
            "summary": (
                "Distilled gaps and strengths from the baseline evaluation into a reusable "
                "strategy row in MongoDB (tags + situation + learned_strategy)."
            ),
            "details": _learned_memory_excerpt(learned_memory),
        },
        {
            "id": "a1",
            "phase": "adaptive",
            "title": "Adaptive retrieval for follow-up",
            "agent": "Retrieval orchestrator",
            "summary": (
                "Re-ranked GOV.UK + semantic + episodic sources using evaluator-aware weights, "
                "keyword boosts, and an LLM retrieval rationale."
            ),
            "details": {
                "query": follow_up_query,
                "trace": retrieval_trace,
                "semantic_candidates_considered": len(semantic_bundle),
                "episodic_candidates_considered": len(episodic_bundle),
                "top_semantic_preview": memory_previews,
            },
        },
        {
            "id": "a1b",
            "phase": "adaptive",
            "title": "Fair baseline: same follow-up, same GOV.UK, memory off",
            "agent": "Visa consultant",
            "summary": (
                f"Isolated control on the same user question using the identical retrieved GOV.UK "
                f"text — semantic and episodic memories cleared — scored {score_followup_govuk_only}/30."
            ),
            "details": {
                "answer_preview": _trunc(answer_followup_govuk_only, 420),
                "answer_char_count": len(answer_followup_govuk_only or ""),
                "context_mode": "govuk_only_same_slices_as_adaptive",
                **_evaluation_step_details(evaluation_followup_govuk_only),
            },
        },
        {
            "id": "a2",
            "phase": "adaptive",
            "title": "Generate memory-augmented answer (same question)",
            "agent": "Visa consultant",
            "summary": (
                f"Same GOV.UK grounding plus {len(semantic_bundle)} semantic snippets and "
                f"{len(episodic_bundle)} episodic interactions."
            ),
            "details": {
                "answer_preview": _trunc(answer_with_memory, 420),
                "answer_char_count": len(answer_with_memory or ""),
                "context_mode": "govuk_plus_memories",
            },
        },
        {
            "id": "a3",
            "phase": "adaptive",
            "title": "Evaluate memory-augmented follow-up",
            "agent": "Evaluator",
            "summary": (
                f"Memory path scored {score_with_memory}/30 vs fair baseline {score_followup_govuk_only}/30 "
                f"(Δ {improvement:+d}; captured up to {improvement_headroom_pct}% of remaining headroom to 30)."
            ),
            "details": _evaluation_step_details(evaluation_with_memory),
        },
        {
            "id": "o1",
            "phase": "outcome",
            "title": "Close the loop",
            "agent": "Harness",
            "summary": (
                "Logged episodic memory, attributed effectiveness to reused memory IDs, "
                "and stored this run in evaluation history."
            ),
            "details": {
                "fair_comparison_note": (
                    "Improvement compares memory-on vs memory-off on the same follow-up with "
                    "identical GOV.UK chunks (opening turn is separate narrative)."
                ),
                "improvement_points": improvement,
                "improvement_headroom_pct": improvement_headroom_pct,
                "opening_turn_score": score_opening,
                "followup_fair_baseline_score": score_followup_govuk_only,
                "followup_memory_score": score_with_memory,
                "memories_used_ids": memory_ids_used,
                "extra_dialogue_turns": extra_dialogue_turns,
            },
        },
    ]
    if extra_dialogue_turns > 0:
        steps.append(
            {
                "id": "o2",
                "phase": "outcome",
                "title": "Extended multi-turn dialogue",
                "agent": "Harness",
                "summary": (
                    f"Processed {extra_dialogue_turns} additional user message(s); "
                    "each turn refreshed adaptive retrieval and episodic logging."
                ),
                "details": {},
            }
        )
    return steps


@traceable(name="retrieve_context")
def _retrieve_govuk_only(user_query: str) -> list[dict[str, Any]]:
    raw_chunks = retrieve_visa_knowledge_chunks(user_query, top_k=8)
    return visa_chunks_for_prompt(raw_chunks)


@traceable(name="generate_answer_without_memory")
def _answer_without_memory(
    user_query: str,
    govuk_chunks: list[dict[str, Any]],
    user_profile: dict[str, Any],
) -> str:
    return generate_visa_consultant_answer(
        user_query,
        govuk_chunks,
        semantic_memories=[],
        episodic_memories=[],
        user_profile=user_profile,
    )


@traceable(name="evaluate_without_memory")
def _evaluate_without_memory(
    user_query: str,
    answer_text: str,
    govuk_chunks: list[dict[str, Any]],
) -> dict[str, Any]:
    return run_evaluation(user_query, answer_text, govuk_chunks)


@traceable(name="create_learning_memory")
def _create_and_store_semantic_memory(
    learned_payload: dict[str, Any],
) -> dict[str, Any]:
    memory_identifier = str(uuid.uuid4())
    learned_payload = dict(learned_payload)
    learned_payload["memory_id"] = memory_identifier
    insert_semantic_memory(learned_payload)
    return learned_payload


@traceable(name="retrieve_adaptive_memory")
def _retrieve_adaptive_bundle(
    follow_up_query: str,
    user_id: str,
    user_profile: dict[str, Any],
    baseline_evaluation: dict[str, Any],
) -> dict[str, Any]:
    return retrieve_adaptive_context_bundle(
        follow_up_query,
        user_id,
        user_profile,
        previous_evaluation=baseline_evaluation,
    )


@traceable(name="generate_answer_with_memory")
def _answer_with_memory_bundle(
    follow_up_query: str,
    bundle: dict[str, Any],
    user_profile: dict[str, Any],
) -> str:
    return generate_visa_consultant_answer(
        follow_up_query,
        bundle["govuk_chunks_prompt"],
        semantic_memories=bundle["semantic_memories"],
        episodic_memories=bundle["episodic_memories"],
        user_profile=user_profile,
    )


@traceable(name="evaluate_with_memory")
def _evaluate_with_memory(
    follow_up_query: str,
    answer_text: str,
    govuk_chunks: list[dict[str, Any]],
) -> dict[str, Any]:
    return run_evaluation(follow_up_query, answer_text, govuk_chunks)


@traceable(name="store_evaluation_run")
def _persist_evaluation_run(document: dict[str, Any]) -> str:
    collection = evaluation_runs_collection()
    collection.insert_one(document)
    return document["run_id"]


def iter_demo_execution(
    initial_query: str,
    follow_up_query: str,
    user_id: str,
    *,
    extra_follow_ups: list[str] | None = None,
) -> Iterator[dict[str, Any]]:
    """Yield JSON-serializable progress events; the last event has ``type`` ``done`` and a ``result`` payload."""
    seq = 0

    def pack(payload: dict[str, Any]) -> dict[str, Any]:
        nonlocal seq
        seq += 1
        return {"seq": seq, **payload}

    primary_follow_up = (follow_up_query or "").strip()
    if not primary_follow_up:
        yield pack({"type": "error", "detail": "follow_up_query is required"})
        return

    client_extras = [q.strip() for q in (extra_follow_ups or []) if q and q.strip()]
    extras = client_extras if client_extras else list(DEMO_PRESET_EXTRA_TURNS)
    follow_chain = [primary_follow_up] + extras
    preset_turns_used = not bool(client_extras)

    yield pack(
        {
            "type": "run_started",
            "initial_query": initial_query,
            "follow_chain": follow_chain,
            "preset_turns_used": preset_turns_used,
            "user_id": user_id,
        }
    )

    user_profile = load_or_create_user_profile(user_id)

    yield pack(
        {
            "type": "transcript",
            "kind": "user",
            "turn_label": "opening",
            "turn_index": -1,
            "text": initial_query,
        }
    )

    yield pack(
        {
            "type": "step_begin",
            "step_id": "opening_retrieve",
            "phase": "baseline",
            "agent": "Vector retrieval",
            "title": "Retrieve GOV.UK (opening)",
        }
    )
    govuk_initial = _retrieve_govuk_only(initial_query)
    preview_initial = _govuk_preview(govuk_initial)
    yield pack(
        {
            "type": "step_end",
            "step_id": "opening_retrieve",
            "proof": {"chunk_count": len(govuk_initial), **preview_initial},
        }
    )
    yield pack(
        {
            "type": "transcript",
            "kind": "proof",
            "turn_label": "opening",
            "title": "GOV.UK retrieval",
            "detail": f"{len(govuk_initial)} chunks retrieved for opening query.",
            "proof": {"titles": [t for t in preview_initial.get("titles", []) if t][:10]},
        }
    )

    yield pack(
        {
            "type": "step_begin",
            "step_id": "opening_answer",
            "phase": "baseline",
            "agent": "Visa consultant",
            "title": "Generate opening answer (memory off)",
        }
    )
    answer_opening = _answer_without_memory(initial_query, govuk_initial, user_profile)
    yield pack(
        {
            "type": "step_end",
            "step_id": "opening_answer",
            "proof": {"chars": len(answer_opening), "preview": _trunc(answer_opening, 360)},
        }
    )
    yield pack(
        {
            "type": "transcript",
            "kind": "assistant",
            "turn_label": "opening",
            "variant": "govuk_only",
            "text": answer_opening,
            "meta": {"memory": False},
        }
    )

    yield pack(
        {
            "type": "step_begin",
            "step_id": "opening_eval",
            "phase": "baseline",
            "agent": "Evaluator",
            "title": "Evaluate opening answer",
        }
    )
    evaluation_opening = _evaluate_without_memory(initial_query, answer_opening, govuk_initial)
    score_opening = int(float(evaluation_opening.get("total_score", 0) or 0))
    yield pack(
        {
            "type": "step_end",
            "step_id": "opening_eval",
            "proof": {"total_score": score_opening, "dimensions": _evaluation_step_details(evaluation_opening)},
        }
    )
    yield pack(
        {
            "type": "transcript",
            "kind": "proof",
            "turn_label": "opening",
            "title": "Opening rubric",
            "detail": f"Total {score_opening}/30",
            "proof": _evaluation_step_details(evaluation_opening),
        }
    )

    yield pack(
        {
            "type": "step_begin",
            "step_id": "reflection",
            "phase": "learning",
            "agent": "Reflection",
            "title": "Reflect & write semantic memory",
        }
    )
    learned_memory = create_learned_memory_from_evaluation(
        initial_query,
        answer_opening,
        evaluation_opening,
    )
    learned_memory = _create_and_store_semantic_memory(learned_memory)
    mem_proof = _proof_memory_row(learned_memory)
    yield pack({"type": "step_end", "step_id": "reflection", "proof": mem_proof})
    yield pack(
        {
            "type": "transcript",
            "kind": "proof",
            "turn_label": "opening",
            "title": "Reflection → MongoDB",
            "detail": "Semantic memory persisted.",
            "proof": mem_proof,
        }
    )

    conversation_turns: list[dict[str, Any]] = []
    first_adaptive_bundle: dict[str, Any] | None = None
    prev_eval_for_retrieval: dict[str, Any] = evaluation_opening

    for turn_index, query_text in enumerate(follow_chain):
        yield pack({"type": "turn_started", "turn_index": turn_index, "query": query_text})
        yield pack(
            {
                "type": "transcript",
                "kind": "user",
                "turn_label": f"follow_up_{turn_index + 1}",
                "turn_index": turn_index,
                "text": query_text,
            }
        )

        yield pack(
            {
                "type": "step_begin",
                "step_id": f"t{turn_index}_retrieve",
                "phase": "adaptive",
                "agent": "Retrieval orchestrator",
                "title": f"Adaptive retrieval (turn {turn_index + 1})",
                "turn_index": turn_index,
            }
        )
        adaptive_bundle = _retrieve_adaptive_bundle(
            query_text,
            user_id,
            user_profile,
            prev_eval_for_retrieval,
        )
        if turn_index == 0:
            first_adaptive_bundle = adaptive_bundle
        retrieval_trace_turn = adaptive_bundle.get("retrieval_trace") or {}
        trace_dict = retrieval_trace_turn if isinstance(retrieval_trace_turn, dict) else {}
        yield pack({"type": "step_end", "step_id": f"t{turn_index}_retrieve", "turn_index": turn_index, "proof": trace_dict})
        yield pack(
            {
                "type": "transcript",
                "kind": "proof",
                "turn_label": f"follow_up_{turn_index + 1}",
                "turn_index": turn_index,
                "title": "Retrieval trace",
                "detail": _trunc(str(trace_dict.get("reason", "")), 420),
                "proof": trace_dict,
            }
        )

        govuk_prompt = adaptive_bundle["govuk_chunks_prompt"]

        yield pack(
            {
                "type": "step_begin",
                "step_id": f"t{turn_index}_fair_answer",
                "phase": "adaptive",
                "agent": "Visa consultant",
                "title": "Fair baseline answer (memory off)",
                "turn_index": turn_index,
            }
        )
        answer_followup_govuk = generate_visa_consultant_answer(
            query_text,
            govuk_prompt,
            semantic_memories=[],
            episodic_memories=[],
            user_profile=user_profile,
        )
        yield pack(
            {
                "type": "step_end",
                "step_id": f"t{turn_index}_fair_answer",
                "turn_index": turn_index,
                "proof": {"chars": len(answer_followup_govuk), "preview": _trunc(answer_followup_govuk, 280)},
            }
        )
        yield pack(
            {
                "type": "transcript",
                "kind": "assistant",
                "turn_label": f"follow_up_{turn_index + 1}",
                "turn_index": turn_index,
                "variant": "fair_baseline",
                "text": answer_followup_govuk,
                "meta": {"memory": False, "label": "Same GOV.UK slices; semantic/episodic cleared"},
            }
        )

        yield pack(
            {
                "type": "step_begin",
                "step_id": f"t{turn_index}_fair_eval",
                "phase": "adaptive",
                "agent": "Evaluator",
                "title": "Evaluate fair baseline",
                "turn_index": turn_index,
            }
        )
        evaluation_followup_govuk = run_evaluation(query_text, answer_followup_govuk, govuk_prompt)
        score_followup_govuk = int(float(evaluation_followup_govuk.get("total_score", 0) or 0))
        yield pack(
            {
                "type": "step_end",
                "step_id": f"t{turn_index}_fair_eval",
                "turn_index": turn_index,
                "proof": {"total_score": score_followup_govuk},
            }
        )
        yield pack(
            {
                "type": "transcript",
                "kind": "proof",
                "turn_label": f"follow_up_{turn_index + 1}",
                "turn_index": turn_index,
                "title": "Fair baseline score",
                "detail": f"{score_followup_govuk}/30",
                "proof": _evaluation_step_details(evaluation_followup_govuk),
            }
        )

        yield pack(
            {
                "type": "step_begin",
                "step_id": f"t{turn_index}_memory_answer",
                "phase": "adaptive",
                "agent": "Visa consultant",
                "title": "Memory-augmented answer",
                "turn_index": turn_index,
            }
        )
        answer_memory = _answer_with_memory_bundle(query_text, adaptive_bundle, user_profile)
        yield pack(
            {
                "type": "step_end",
                "step_id": f"t{turn_index}_memory_answer",
                "turn_index": turn_index,
                "proof": {"chars": len(answer_memory), "preview": _trunc(answer_memory, 280)},
            }
        )
        yield pack(
            {
                "type": "transcript",
                "kind": "assistant",
                "turn_label": f"follow_up_{turn_index + 1}",
                "turn_index": turn_index,
                "variant": "memory",
                "text": answer_memory,
                "meta": {"memory": True},
            }
        )

        yield pack(
            {
                "type": "step_begin",
                "step_id": f"t{turn_index}_memory_eval",
                "phase": "adaptive",
                "agent": "Evaluator",
                "title": "Evaluate memory answer",
                "turn_index": turn_index,
            }
        )
        evaluation_memory = _evaluate_with_memory(query_text, answer_memory, govuk_prompt)
        score_memory = int(float(evaluation_memory.get("total_score", 0) or 0))
        improvement_turn = score_memory - score_followup_govuk
        headroom_pct = _headroom_pct(score_followup_govuk, improvement_turn)
        yield pack(
            {
                "type": "step_end",
                "step_id": f"t{turn_index}_memory_eval",
                "turn_index": turn_index,
                "proof": {
                    "total_score": score_memory,
                    "improvement": improvement_turn,
                    "headroom_pct": headroom_pct,
                },
            }
        )
        yield pack(
            {
                "type": "transcript",
                "kind": "proof",
                "turn_label": f"follow_up_{turn_index + 1}",
                "turn_index": turn_index,
                "title": "Memory path outcome",
                "detail": f"Score {score_memory}/30 · Δ {improvement_turn:+d} · headroom {headroom_pct}%",
                "proof": {
                    "evaluation": _evaluation_step_details(evaluation_memory),
                    "improvement": improvement_turn,
                    "headroom_pct": headroom_pct,
                },
            }
        )

        memory_ids_used = [
            item["memory_id"]
            for item in adaptive_bundle.get("retrieved_memories", [])
            if item.get("memory_id")
        ]
        update_memory_effectiveness(memory_ids_used, float(improvement_turn))

        interaction_identifier = str(uuid.uuid4())
        record_episodic_memory(
            interaction_id=interaction_identifier,
            user_id=user_id,
            query=query_text,
            answer=answer_memory,
            score=score_memory,
            missing_points=list(evaluation_memory.get("missing_points") or []),
            memories_used=memory_ids_used,
        )

        yield pack(
            {
                "type": "step_begin",
                "step_id": f"t{turn_index}_persist",
                "phase": "outcome",
                "agent": "Harness",
                "title": "Episodic log & effectiveness",
                "turn_index": turn_index,
            }
        )
        yield pack(
            {
                "type": "step_end",
                "step_id": f"t{turn_index}_persist",
                "turn_index": turn_index,
                "proof": {"memories_used": memory_ids_used, "interaction_logged": True},
            }
        )
        yield pack(
            {
                "type": "transcript",
                "kind": "proof",
                "turn_label": f"follow_up_{turn_index + 1}",
                "turn_index": turn_index,
                "title": "Persisted interaction",
                "detail": f"Episodic row + effectiveness update ({len(memory_ids_used)} memory IDs).",
                "proof": {"memory_ids": memory_ids_used},
            }
        )

        conversation_turns.append(
            {
                "turn_index": turn_index,
                "query": query_text,
                "followup_baseline_answer": answer_followup_govuk,
                "score_followup_baseline": score_followup_govuk,
                "evaluation_followup_baseline": evaluation_followup_govuk,
                "answer_with_memory": answer_memory,
                "score_with_memory": score_memory,
                "evaluation_with_memory": evaluation_memory,
                "improvement": improvement_turn,
                "improvement_headroom_pct": headroom_pct,
                "retrieval_trace": trace_dict,
                "retrieved_memories": adaptive_bundle.get("retrieved_memories") or [],
            }
        )

        prev_eval_for_retrieval = evaluation_memory

    if first_adaptive_bundle is None:
        yield pack({"type": "error", "detail": "demo produced no conversation turns"})
        return

    first_turn = conversation_turns[0]
    improvement_first = int(first_turn["improvement"])
    improvement_headroom_first = int(first_turn["improvement_headroom_pct"])
    retrieval_trace_payload = first_turn["retrieval_trace"]

    memory_ids_first = [
        item["memory_id"]
        for item in first_adaptive_bundle.get("retrieved_memories", [])
        if item.get("memory_id")
    ]

    workflow_steps = _build_demo_workflow_steps(
        initial_query=initial_query,
        follow_up_query=primary_follow_up,
        govuk_initial=govuk_initial,
        answer_opening_govuk_only=answer_opening,
        evaluation_opening=evaluation_opening,
        score_opening=score_opening,
        learned_memory=learned_memory,
        adaptive_bundle=first_adaptive_bundle,
        answer_followup_govuk_only=str(first_turn["followup_baseline_answer"]),
        evaluation_followup_govuk_only=first_turn["evaluation_followup_baseline"],
        score_followup_govuk_only=int(first_turn["score_followup_baseline"]),
        answer_with_memory=str(first_turn["answer_with_memory"]),
        evaluation_with_memory=first_turn["evaluation_with_memory"],
        score_with_memory=int(first_turn["score_with_memory"]),
        improvement=improvement_first,
        improvement_headroom_pct=improvement_headroom_first,
        memory_ids_used=memory_ids_first,
        retrieval_trace=retrieval_trace_payload if isinstance(retrieval_trace_payload, dict) else {},
        extra_dialogue_turns=max(0, len(follow_chain) - 1),
    )

    yield pack(
        {
            "type": "step_begin",
            "step_id": "mongo_eval_run",
            "phase": "outcome",
            "agent": "Harness",
            "title": "Persist evaluation run (MongoDB)",
        }
    )
    run_identifier = str(uuid.uuid4())
    memory_inventory = _demo_memory_inventory(user_id)
    evaluation_document = {
        "run_id": run_identifier,
        "user_id": user_id,
        "initial_query": initial_query,
        "follow_up_query": primary_follow_up,
        "extra_follow_ups": extras,
        "preset_turns_used": preset_turns_used,
        "answer_without_memory": answer_opening,
        "answer_with_memory": first_turn["answer_with_memory"],
        "score_without_memory": score_opening,
        "score_followup_baseline": int(first_turn["score_followup_baseline"]),
        "score_with_memory": int(first_turn["score_with_memory"]),
        "improvement": improvement_first,
        "improvement_headroom_pct": improvement_headroom_first,
        "memories_used": memory_ids_first,
        "retrieval_strategy_used": retrieval_trace_payload,
        "workflow_steps": workflow_steps,
        "conversation_turns": conversation_turns,
        "memory_inventory": memory_inventory,
        "created_at": datetime.now(timezone.utc),
    }
    _persist_evaluation_run(evaluation_document)
    yield pack({"type": "step_end", "step_id": "mongo_eval_run", "proof": {"run_id": run_identifier}})

    result: dict[str, Any] = {
        "initial_query": initial_query,
        "answer_without_memory": answer_opening,
        "score_without_memory": score_opening,
        "evaluation_without_memory": evaluation_opening,
        "learned_memory": learned_memory,
        "follow_up_query": primary_follow_up,
        "followup_baseline_answer": first_turn["followup_baseline_answer"],
        "score_followup_baseline": int(first_turn["score_followup_baseline"]),
        "evaluation_followup_baseline": first_turn["evaluation_followup_baseline"],
        "retrieved_memories": first_adaptive_bundle.get("retrieved_memories", []),
        "retrieval_trace": retrieval_trace_payload,
        "workflow_steps": workflow_steps,
        "answer_with_memory": first_turn["answer_with_memory"],
        "score_with_memory": int(first_turn["score_with_memory"]),
        "evaluation_with_memory": first_turn["evaluation_with_memory"],
        "improvement": improvement_first,
        "improvement_headroom_pct": improvement_headroom_first,
        "conversation_turns": conversation_turns,
        "preset_turns_used": preset_turns_used,
        "follow_chain": follow_chain,
        "memory_inventory": memory_inventory,
    }
    yield pack({"type": "done", "result": result})


def run_demo(
    initial_query: str,
    follow_up_query: str,
    user_id: str,
    *,
    extra_follow_ups: list[str] | None = None,
) -> dict[str, Any]:
    last_result: dict[str, Any] | None = None
    for event in iter_demo_execution(initial_query, follow_up_query, user_id, extra_follow_ups=extra_follow_ups):
        if event.get("type") == "done":
            raw = event.get("result")
            if isinstance(raw, dict):
                last_result = raw
        if event.get("type") == "error":
            raise ValueError(str(event.get("detail", "demo failed")))
    if last_result is None:
        raise RuntimeError("demo finished without a result payload")
    return last_result


def iter_chat_execution(user_id: str, user_query: str) -> Iterator[dict[str, Any]]:
    """SSE-friendly chat run: transcript + step_* events, then ``done`` with ChatResponse-shaped result."""
    seq = 0

    def pack(payload: dict[str, Any]) -> dict[str, Any]:
        nonlocal seq
        seq += 1
        return {"seq": seq, **payload}

    query_clean = (user_query or "").strip()
    if not query_clean:
        yield pack({"type": "error", "detail": "query is required"})
        return

    yield pack({"type": "chat_started", "user_id": user_id, "query": query_clean})
    yield pack(
        {
            "type": "transcript",
            "kind": "user",
            "turn_label": "chat",
            "text": query_clean,
        }
    )

    user_profile = load_or_create_user_profile(user_id)
    turn_signals = heuristic_signals(query_clean)
    yield pack(
        {
            "type": "transcript",
            "kind": "proof",
            "turn_label": "chat",
            "title": "Tone, situation & visa-topic hints (this message)",
            "detail": (
                f"{len(turn_signals.get('tone_markers') or [])} tone · "
                f"{len(turn_signals.get('situation_hints') or [])} situation · "
                f"{len(turn_signals.get('visa_topic_hints') or [])} visa-topic — fast scan before retrieval."
            ),
            "proof": turn_signals,
        }
    )

    yield pack(
        {
            "type": "step_begin",
            "step_id": "chat_retrieve",
            "phase": "adaptive",
            "agent": "Retrieval orchestrator",
            "title": "Adaptive retrieval (GOV.UK + memories)",
        }
    )
    adaptive_bundle = retrieve_adaptive_context_bundle(
        query_clean,
        user_id,
        user_profile,
        previous_evaluation=None,
        turn_intent_hints=turn_signals.get("visa_topic_hints"),
        turn_tone_markers=turn_signals.get("tone_markers"),
        turn_situation_hints=turn_signals.get("situation_hints"),
    )
    trace_raw = adaptive_bundle.get("retrieval_trace") or {}
    trace_dict = trace_raw if isinstance(trace_raw, dict) else {}
    yield pack({"type": "step_end", "step_id": "chat_retrieve", "proof": trace_dict})
    yield pack(
        {
            "type": "transcript",
            "kind": "proof",
            "turn_label": "chat",
            "title": "Retrieval trace",
            "detail": _trunc(str(trace_dict.get("reason", "")), 420),
            "proof": trace_dict,
        }
    )

    yield pack(
        {
            "type": "step_begin",
            "step_id": "chat_answer",
            "phase": "chat",
            "agent": "Visa consultant",
            "title": "Generate answer",
        }
    )
    answer_text = generate_visa_consultant_answer(
        query_clean,
        adaptive_bundle["govuk_chunks_prompt"],
        adaptive_bundle["semantic_memories"],
        adaptive_bundle["episodic_memories"],
        user_profile,
        turn_context=turn_signals,
    )
    yield pack(
        {
            "type": "step_end",
            "step_id": "chat_answer",
            "proof": {"chars": len(answer_text), "preview": _trunc(answer_text, 360)},
        }
    )
    yield pack(
        {
            "type": "transcript",
            "kind": "assistant",
            "turn_label": "chat",
            "variant": "memory",
            "text": answer_text,
            "meta": {"memory": True},
        }
    )

    yield pack(
        {
            "type": "step_begin",
            "step_id": "chat_profile_learn",
            "phase": "learning",
            "agent": "Profile learning",
            "title": "Infer durable profile traits & merge",
        }
    )
    profile_delta = infer_profile_delta_from_turn(query_clean, answer_text, user_profile)
    for marker in turn_signals.get("tone_markers") or []:
        if marker not in (profile_delta.get("tone_labels") or []):
            profile_delta.setdefault("tone_labels", []).append(marker)

    sit_hints = turn_signals.get("situation_hints") or []
    likely_out = "likely_outside_uk" in sit_hints
    likely_in = "likely_inside_uk" in sit_hints
    if likely_out and not likely_in:
        profile_delta.setdefault("uk_presence", "outside_uk")
        fb = "User wording suggests they are outside the UK or applying from overseas."
        sb = profile_delta.setdefault("situational_bullets", [])
        if fb not in sb:
            sb.append(fb)
    elif likely_in and not likely_out:
        profile_delta.setdefault("uk_presence", "inside_uk")
        fb = "User wording suggests they are already in the UK."
        sb = profile_delta.setdefault("situational_bullets", [])
        if fb not in sb:
            sb.append(fb)

    updated_user_profile = apply_profile_delta(user_id, profile_delta, bump_interaction_count=True)
    delta_safe = encode_json_safe_payload(profile_delta)
    profile_safe = encode_json_safe_payload(updated_user_profile)
    yield pack(
        {
            "type": "step_end",
            "step_id": "chat_profile_learn",
            "proof": {"delta_fields": list(delta_safe.keys()), "interaction_count": profile_safe.get("interaction_count")},
        }
    )
    yield pack(
        {
            "type": "transcript",
            "kind": "proof",
            "turn_label": "chat",
            "title": "Profile learning",
            "detail": "Merged tone labels, psychological notes, topics, and persona bullets into your stored profile.",
            "proof": {"delta_applied": delta_safe, "profile_snapshot": profile_safe},
        }
    )
    yield pack({"type": "profile_refresh", "profile": profile_safe, "delta_applied": delta_safe})

    yield pack(
        {
            "type": "step_begin",
            "step_id": "chat_eval",
            "phase": "chat",
            "agent": "Evaluator",
            "title": "Evaluate answer",
        }
    )
    evaluation_payload = run_evaluation(query_clean, answer_text, adaptive_bundle["govuk_chunks_prompt"])
    score_int = int(float(evaluation_payload.get("total_score", 0) or 0))
    yield pack({"type": "step_end", "step_id": "chat_eval", "proof": {"total_score": score_int}})
    yield pack(
        {
            "type": "transcript",
            "kind": "proof",
            "turn_label": "chat",
            "title": "Evaluator rubric",
            "detail": f"Total {score_int}/30",
            "proof": _evaluation_step_details(evaluation_payload),
        }
    )

    learned_memory: dict[str, Any] = {}
    missing_points = list(evaluation_payload.get("missing_points") or [])
    if missing_points or score_int < 27:
        yield pack(
            {
                "type": "step_begin",
                "step_id": "chat_reflect",
                "phase": "learning",
                "agent": "Reflection",
                "title": "Persist semantic memory",
            }
        )
        learned_memory = create_learned_memory_from_evaluation(query_clean, answer_text, evaluation_payload)
        learned_memory["memory_id"] = str(uuid.uuid4())
        insert_semantic_memory(learned_memory)
        yield pack({"type": "step_end", "step_id": "chat_reflect", "proof": _proof_memory_row(learned_memory)})
        yield pack(
            {
                "type": "transcript",
                "kind": "proof",
                "turn_label": "chat",
                "title": "Reflection → MongoDB",
                "detail": "Semantic memory upserted from this turn.",
                "proof": _proof_memory_row(learned_memory),
            }
        )

    memory_ids = [
        row.get("memory_id", "")
        for row in adaptive_bundle.get("retrieved_memories", [])
        if row.get("memory_id")
    ]
    yield pack(
        {
            "type": "step_begin",
            "step_id": "chat_effectiveness",
            "phase": "outcome",
            "agent": "Harness",
            "title": "Record semantic memory usage (chat)",
        }
    )
    record_semantic_memory_usage(memory_ids)
    yield pack(
        {
            "type": "step_end",
            "step_id": "chat_effectiveness",
            "proof": {
                "memories_touched": len(memory_ids),
                "note": "usage_count only — chat has no A/B delta; avoids poisoning improvement averages.",
            },
        }
    )

    chat_episode_id = str(uuid.uuid4())
    record_episodic_memory(
        interaction_id=chat_episode_id,
        user_id=user_id,
        query=query_clean,
        answer=answer_text,
        score=score_int,
        missing_points=list(evaluation_payload.get("missing_points") or []),
        memories_used=memory_ids,
    )

    result: dict[str, Any] = {
        "answer": answer_text,
        "score": score_int,
        "retrieved_context": adaptive_bundle.get("govuk_chunks_raw", []),
        "retrieved_memories": adaptive_bundle.get("retrieved_memories", []),
        "learned_memory": learned_memory,
        "evaluation": evaluation_payload,
        "retrieval_trace": adaptive_bundle.get("retrieval_trace", {}),
        "user_profile": profile_safe,
        "turn_signals": encode_json_safe_payload(turn_signals),
        "profile_learning_delta": delta_safe,
    }
    yield pack({"type": "done", "result": result})


def run_memory_enabled_chat(user_id: str, user_query: str) -> dict[str, Any]:
    last: dict[str, Any] | None = None
    for event in iter_chat_execution(user_id, user_query):
        if event.get("type") == "done":
            raw = event.get("result")
            if isinstance(raw, dict):
                last = raw
        if event.get("type") == "error":
            raise ValueError(str(event.get("detail", "chat failed")))
    if last is None:
        raise RuntimeError("chat stream produced no result")
    return last


def build_simple_chat_graph():
    """Minimal LangGraph wiring for observability-friendly composition."""
    from typing import TypedDict

    from langgraph.graph import END, START, StateGraph

    class ChatState(TypedDict, total=False):
        user_id: str
        query: str
        result: dict[str, Any]

    def chat_node(state: ChatState) -> dict[str, Any]:
        payload = run_memory_enabled_chat(state["user_id"], state["query"])
        return {"result": payload}

    graph = StateGraph(ChatState)
    graph.add_node("memory_chat", chat_node)
    graph.add_edge(START, "memory_chat")
    graph.add_edge("memory_chat", END)
    return graph.compile()
