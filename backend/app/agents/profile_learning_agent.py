"""Infer tone, psychological cues, and communication preferences from chat (UK visa domain)."""

from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from app.logging_setup import get_logger
from app.services.llm_service import get_chat_model, message_text

logger = get_logger("agents.profile_learning")

_PROFILE_DELTA_SYSTEM = """You update the user's profile for a UK visa guidance assistant: (A) relational/tone, (B) stated personal **situation** they mention — both persist across future turns.

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "tone_labels": string[],
  "psychological_notes": string[],
  "trait_bullets": string[],
  "communication_note": string,
  "topic_tags": string[],
  "goal_hypothesis": string,
  "uk_presence": string,
  "nationality_guess": string,
  "location_summary": string,
  "situational_bullets": string[]
}

Rules — situational (only when the user clearly implies or states it):
- uk_presence: exactly one of: "unknown", "outside_uk", "inside_uk". Use outside_uk if they say they are abroad, applying from another country, not in the UK, overseas, etc. Use inside_uk if they say they are already in the UK, switching visa while here, living in London, etc. Use unknown if unclear.
- nationality_guess: empty unless they name a nationality/country (e.g. "Indian citizen", "from Nigeria"); short phrase only.
- location_summary: empty OR one short phrase summarising where they are applying from / living (e.g. "Applying from India, not yet in UK").
- situational_bullets: 0–4 neutral factual bullets the assistant should remember (e.g. "States they have not entered the UK yet"). No guesses beyond the message.

Rules — relational (same as before):
- tone_labels: snake_case mood/stance tags max 6.
- psychological_notes: 1–4 short observations for tone; no clinical diagnosis.
- trait_bullets: durable **reply preferences** (prefers_checklists, short_paragraphs_only, avoid_jargon, wants_timescale_estimates, etc.) max 4 — honoured on future turns.
- communication_note: prefers_* tokens as before.
- topic_tags: optional visa keywords max 4.
- goal_hypothesis: optional short practical/emotional aim.

Be conservative; prefer unknown and empty arrays when unsure."""

# Same-turn signals: how the user sounds (fast keyword scan, no LLM).
_TONE_MARKER_RULES: list[tuple[str, list[str]]] = [
    ("seeks_reassurance", ["worried", "anxious", "scared", "nervous", "sure?", "not sure", "is it ok", "will i"]),
    ("feeling_overwhelmed", ["overwhelmed", "too much", "confused", "don't understand", "lost", "complicated"]),
    ("expresses_frustration", ["frustrated", "ridiculous", "unfair", "why is", "annoyed", "fed up"]),
    ("wants_simple_language", ["simple", "plain english", "explain like", "non native", "english not"]),
    ("wants_more_detail", ["detail", "in depth", "comprehensive", "everything about", "full picture"]),
    ("wants_direct_answers", ["just tell me", "straight answer", "short", "quickly", "tl;dr", "bottom line"]),
    ("signals_urgency", ["urgent", "asap", "deadline", "soon", "running out of time"]),
    ("polite_formal", ["dear ", "kindly", "would you please", "sincerely"]),
    ("casual_friendly", ["hey", "hi ", "thanks!", "cheers", "btw"]),
]

# Retrieval helpers only — factual visa themes (secondary to tone).
# Where the user says they are — drives overseas vs in-UK framing (not visa routing keywords).
_SITUATION_HINT_RULES: list[tuple[str, list[str]]] = [
    (
        "likely_outside_uk",
        [
            "outside the uk",
            "outside uk",
            "not in the uk",
            "not in uk",
            "from abroad",
            "overseas",
            "applying from",
            "apply from",
            "in my country",
            "home country",
            "never been to the uk",
            "never been to uk",
            "don't live in the uk",
            "dont live in the uk",
            "embassy",
            "consulate",
            "from india",
            "from pakistan",
            "from nigeria",
            "from usa",
            "from canada",
        ],
    ),
    (
        "likely_inside_uk",
        [
            "already in the uk",
            "already in uk",
            "in the uk now",
            "currently in the uk",
            "living in the uk",
            "living in uk",
            "i am in the uk",
            "i'm in the uk",
            "im in the uk",
            "here in the uk",
            "switch from student",
            "switching from",
            "extend my visa",
            "in london",
            "in manchester",
            "on a student visa in",
        ],
    ),
]

_VISA_TOPIC_HINT_RULES: list[tuple[str, list[str]]] = [
    ("documents_evidence", ["document", "evidence", "proof", "certificate", "upload", "tb test"]),
    ("sponsorship_cos", ["sponsor", "cos", "certificate of sponsorship", "licensed sponsor"]),
    ("salary_threshold", ["salary", "minimum wage", "going rate", "occupation code", "soc"]),
    ("english_language", ["english", "ielts", "language test", "cefr", "selt"]),
    ("dependants_family", ["partner", "spouse", "child", "dependant", "family"]),
    ("application_process", ["apply", "application", "fee", "processing time", "how long"]),
    ("switching_visa", ["switch", "already in uk", "student visa", "graduate"]),
    ("travel_absence", ["travel", "outside uk", "absence", "return"]),
]


def heuristic_signals(query: str) -> dict[str, list[str]]:
    """Fast signals: tone, situational (UK vs abroad), and visa-topic hints for retrieval."""
    q = (query or "").lower()
    tone_markers: list[str] = []
    for marker_id, kws in _TONE_MARKER_RULES:
        if any(kw in q for kw in kws):
            tone_markers.append(marker_id)

    situation_hints: list[str] = []
    for hint_id, kws in _SITUATION_HINT_RULES:
        if any(kw in q for kw in kws):
            situation_hints.append(hint_id)

    visa_hints: list[str] = []
    visa_labels: list[str] = []
    for hint_id, kws in _VISA_TOPIC_HINT_RULES:
        if any(kw in q for kw in kws):
            visa_hints.append(hint_id)
            visa_labels.append(hint_id.replace("_", " "))

    seen_t: set[str] = set()
    tone_markers = [x for x in tone_markers if not (x in seen_t or seen_t.add(x))][:10]
    seen_s: set[str] = set()
    situation_hints = [x for x in situation_hints if not (x in seen_s or seen_s.add(x))][:6]
    seen_v: set[str] = set()
    visa_hints = [x for x in visa_hints if not (x in seen_v or seen_v.add(x))][:8]

    return {
        "tone_markers": tone_markers,
        "situation_hints": situation_hints,
        "visa_topic_hints": visa_hints,
        "visa_topic_labels": visa_labels[:8],
    }


def infer_profile_delta_from_turn(
    user_query: str,
    assistant_answer: str,
    current_profile: dict[str, Any],
) -> dict[str, Any]:
    """Structured LLM extraction; merge via ``apply_profile_delta``."""
    cleaned_query = (user_query or "").strip()
    preview = (assistant_answer or "").strip()[:2800]
    if not cleaned_query:
        return {}

    profile_hint = json.dumps(
        {
            "goal": current_profile.get("goal"),
            "preferred_style": current_profile.get("preferred_style"),
            "uk_presence": current_profile.get("uk_presence"),
            "nationality": current_profile.get("nationality"),
            "current_location": current_profile.get("current_location"),
            "mentioned_facts": (current_profile.get("mentioned_facts") or [])[:12],
            "tone_history": (current_profile.get("tone_history") or [])[-12:],
            "psychological_notes": (current_profile.get("psychological_notes") or [])[:10],
            "persona_bullets": (current_profile.get("persona_bullets") or [])[:10],
            "topic_tags": (current_profile.get("topic_tags") or [])[:12],
        },
        ensure_ascii=False,
    )

    llm = get_chat_model(temperature=0.1)
    raw = message_text(
        llm.invoke(
            [
                SystemMessage(content=_PROFILE_DELTA_SYSTEM),
                HumanMessage(
                    content=(
                        f"Current profile snapshot: {profile_hint}\n\n"
                        f"User message:\n{cleaned_query}\n\n"
                        f"Assistant reply excerpt:\n{preview}"
                    )
                ),
            ]
        ).content
    )

    text = raw.strip()
    if "```" in text:
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)

    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            logger.warning("profile_delta_json_parse_failed raw_len=%s", len(text))
            return {}
        try:
            parsed = json.loads(match.group(0))
        except json.JSONDecodeError:
            logger.warning("profile_delta_json_extract_failed")
            return {}

    if not isinstance(parsed, dict):
        return {}

    out: dict[str, Any] = {}
    for key in ("tone_labels", "psychological_notes", "trait_bullets", "topic_tags", "situational_bullets"):
        val = parsed.get(key)
        if isinstance(val, list):
            out[key] = [str(x).strip() for x in val if str(x).strip()][:8]
    for key in ("communication_note", "goal_hypothesis", "nationality_guess", "location_summary"):
        val = parsed.get(key)
        if isinstance(val, str) and val.strip():
            out[key] = val.strip()[:500]

    ukp = parsed.get("uk_presence")
    if isinstance(ukp, str) and ukp.strip().lower() in ("unknown", "outside_uk", "inside_uk"):
        out["uk_presence"] = ukp.strip().lower()

    # Backward compatibility if older prompt returns legacy keys
    legacy_intents = parsed.get("detected_intents")
    if isinstance(legacy_intents, list) and "tone_labels" not in out:
        out["tone_labels"] = [str(x).strip() for x in legacy_intents if str(x).strip()][:6]

    return out
