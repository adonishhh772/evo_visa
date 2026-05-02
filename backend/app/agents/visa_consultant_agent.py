"""Visa consultant generation grounded on GOV.UK context and memories."""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.services.llm_service import get_chat_model, message_text
from app.util.json_api import encode_json_safe_payload
from app.util.text_cleanup import beautify_consultant_reply, ensure_consultant_disclaimer

CONSULTANT_SYSTEM = """You are EvoVisa, a UK Skilled Worker visa guidance assistant. You provide general information only, not legal advice. Use only the provided GOV.UK context and retrieved memories. If key information is missing, ask a clear follow-up question. For Skilled Worker visa queries, mention sponsorship, job offer, eligible occupation, salary requirement, English language requirement, documents, and next steps when relevant.

**Conversation flow & continuity:** This is a multi-turn relationship. The **episodic memories** block is retrieved from this user’s prior messages (relevance-ranked, not always chronological)—use it to stay consistent with what you already told them, pick up threads, and avoid contradictions. When they ask a follow-up, **extend** the story (next step, nuance, exception) instead of answering as if it were their first message—unless the topic is wholly new. If the profile’s ``interaction_count`` is high, be slightly more direct and less repetitive. If **Adaptation directives** appear in the user message, follow them as hard constraints on tone and framing for this reply.

**Situation & personal facts from the profile:** Use ``uk_presence``, ``nationality``, ``current_location``, and ``mentioned_facts``. When ``uk_presence`` is ``outside_uk``, consistently frame guidance for someone **not yet in the UK** / applying from abroad (e.g. overseas application steps, entry clearance lens where relevant, getting a decision before travel)—unless the current question is purely generic. When ``inside_uk``, favour **in-country** framing (switching, extending, applying from within the UK). If ``uk_presence`` is ``unknown``, do not assume; you may ask one clarifying question if location changes the route. Use ``nationality`` and ``current_location`` only when provided; never invent.

**Relational style:** ``tone_history`` and ``psychological_notes`` describe mood and coping; use them to calibrate warmth and pacing.

**Answer preferences (must honour):** ``preferred_style`` is their chosen answer shape: ``concise`` (short, bullets OK), ``detailed_step_by_step`` (numbered steps, checkpoints), ``plain_language`` (simple words, define jargon once), ``warm_reassuring`` (steady, validating openings before facts), ``clear_step_by_step`` (default balanced structure). ``persona_bullets`` / ``trait_bullets`` are durable **reply preferences** (e.g. checklists, avoid walls of text)—apply on **every** turn unless GOV.UK safety requires extra detail. When ``this_turn_signals`` conflicts slightly, prefer stored preferences for length/tone but still reflect same-turn urgency.

When ``this_turn_signals`` is present, ``tone_markers`` and ``situation_hints`` tune **this message**; ``visa_topic_hints`` help retrieval. Do not lecture if they sound overwhelmed.

Never invent clinical diagnoses.

When semantic or episodic memory blocks are present (not "(no prior learned strategies)" / "(no recent interactions…)"): GOV.UK context is authoritative for immigration rules and eligibility facts. Use memories only for tone, continuity, and reframing—do not introduce factual claims that GOV.UK does not support unless they are clearly the user’s stated situation from episodic text. If retrieved memories are weakly related to this question, answer almost as compactly as you would with empty memory blocks; do not pad with generic reminders pulled from unrelated strategies.

Formatting: Write for a plain-text chat surface (not Markdown). Do not use heading hashes (#, ##), bold or strikethrough markers (**text**, ~~text~~), or decorative rule lines made only of dashes/asterisks. Use simple numbered lists (1. 2.) or hyphen bullets (- item). Short labels may be Title Case on their own line followed by a blank line instead of headings.

Always end with at least one explicit sentence that this is general guidance, not legal advice, and that the user must verify details on GOV.UK or with a qualified adviser—never omit this, including on long or memory-heavy replies."""


def _format_govuk(chunks: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for index, chunk in enumerate(chunks, start=1):
        parts.append(
            f"[{index}] ({chunk.get('title', '')}) {chunk.get('url', '')}\n{chunk.get('text', '')}"
        )
    return "\n\n---\n\n".join(parts) if parts else "(no GOV.UK chunks retrieved)"


def _format_semantic(memories: list[dict[str, Any]]) -> str:
    if not memories:
        return "(no prior learned strategies)"
    parts: list[str] = []
    for index, memory in enumerate(memories, start=1):
        tags = ", ".join(memory.get("tags") or [])
        parts.append(
            f"[{index}] situation: {memory.get('situation', '')}\n"
            f"strategy: {memory.get('learned_strategy', '')}\n"
            f"tags: {tags}"
        )
    return "\n\n".join(parts)


def _adaptation_directives(user_profile: dict[str, Any], turn_context: dict[str, Any] | None) -> str:
    """Plain-language nudges so the model weights profile + flow alongside raw JSON."""
    lines: list[str] = []
    count = user_profile.get("interaction_count")
    if isinstance(count, int) and count > 0:
        lines.append(
            f"- Prior dialogue depth: about {count} stored chat turn(s) with this user — prefer continuity; "
            "do not re-introduce basics they likely heard unless they ask."
        )
    uk = str(user_profile.get("uk_presence") or "unknown").lower()
    if uk == "outside_uk":
        lines.append("- Keep default framing: applicant outside the UK unless this question is location-neutral.")
    elif uk == "inside_uk":
        lines.append("- Keep default framing: user already in the UK (switching/extension/in-country) unless neutral.")

    psych = user_profile.get("psychological_notes") or []
    if isinstance(psych, list) and psych:
        tail = str(psych[-1]).strip()
        if tail:
            lines.append(f"- Latest relational note to honour: {tail[:220]}")

    tones = user_profile.get("tone_history") or []
    if isinstance(tones, list) and tones:
        tail_t = str(tones[-1]).strip().replace("_", " ")
        if tail_t:
            lines.append(f"- Recent tone signal: {tail_t}")

    pref = str(user_profile.get("preferred_style") or "").strip().lower()
    style_hints = {
        "concise": "Keep answers compact; lead with the bottom line; optional short bullets.",
        "detailed_step_by_step": "Use clear numbered steps and sub-points where helpful.",
        "plain_language": "Prefer plain English; briefly explain any necessary visa term once.",
        "warm_reassuring": "Open with a brief steadying line before facts; avoid cold bureaucratic tone.",
        "clear_step_by_step": "Balanced structure: short overview then ordered steps.",
    }
    if pref and pref in style_hints:
        lines.append(f"- Stored answer preference (`preferred_style={pref}`): {style_hints[pref]}")

    persona = user_profile.get("persona_bullets") or []
    if isinstance(persona, list) and persona:
        for bullet in [str(b).strip() for b in persona[-4:] if str(b).strip()]:
            lines.append(f"- Reply preference to honour: {bullet[:240]}")

    if turn_context:
        lines.append(
            "- Same-turn signals are in JSON under this_turn_signals — adjust warmth, directness, "
            "and urgency for this message."
        )

    return "\n".join(lines) if lines else "- No extra directives beyond the profile JSON."


def _format_episodic(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "(no recent interactions — first turns may have limited continuity context)"
    parts: list[str] = []
    for index, row in enumerate(rows, start=1):
        parts.append(
            f"[{index}] prior query: {row.get('query', '')}\n"
            f"prior answer excerpt: {row.get('answer', '')[:520]}"
        )
    return (
        "Rows are relevance-ranked to the current question (may skip chronological order).\n\n" + "\n\n".join(parts)
    )


def generate_visa_consultant_answer(
    user_query: str,
    govuk_chunks: list[dict[str, Any]],
    semantic_memories: list[dict[str, Any]],
    episodic_memories: list[dict[str, Any]],
    user_profile: dict[str, Any],
    turn_context: dict[str, Any] | None = None,
) -> str:
    llm = get_chat_model(temperature=0.35)
    profile_payload: dict[str, Any] = dict(encode_json_safe_payload(user_profile))
    if turn_context:
        profile_payload["this_turn_signals"] = encode_json_safe_payload(turn_context)
    profile_json = json.dumps(profile_payload, ensure_ascii=False)
    directives = _adaptation_directives(user_profile, turn_context)
    semantic_blob = _format_semantic(semantic_memories)
    episodic_blob = _format_episodic(episodic_memories)
    memory_layers_active = bool(semantic_memories) or bool(episodic_memories)

    user_content = f"""User profile (JSON): {profile_json}

Adaptation directives (follow these for this reply):
{directives}

GOV.UK context:
{_format_govuk(govuk_chunks)}

Learned semantic memories (reusable strategies from reflection):
{semantic_blob}

Episodic memories (this user’s earlier turns — use for continuity and consistency):
{episodic_blob}
"""
    if memory_layers_active:
        user_content += """
Memory discipline: Prefer a concise GOV.UK-grounded core matching what you would say if memory blocks were empty; then add at most a short continuity hook when episodic/semantic content clearly applies. Avoid repeating entire prior answers.
Mandatory close: still finish with the GOV.UK / not legal advice / qualified adviser line even if the answer is long."""

    user_content += f"""

Current user message:
{user_query}
"""
    response = llm.invoke(
        [
            SystemMessage(content=CONSULTANT_SYSTEM),
            HumanMessage(content=user_content),
        ]
    )
    raw = beautify_consultant_reply(message_text(response.content))
    return ensure_consultant_disclaimer(raw)
