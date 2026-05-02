"""Load or create minimal user profiles for personalisation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.database.mongodb_client import user_profiles_collection


def load_or_create_user_profile(user_id: str) -> dict[str, Any]:
    collection = user_profiles_collection()
    existing = collection.find_one({"user_id": user_id})
    if existing:
        existing.pop("_id", None)
        _ensure_profile_defaults_inplace(existing)
        return existing

    default_profile = _default_profile_document(user_id)
    collection.update_one({"user_id": user_id}, {"$setOnInsert": default_profile}, upsert=True)
    refreshed = collection.find_one({"user_id": user_id}) or default_profile
    refreshed.pop("_id", None)
    _ensure_profile_defaults_inplace(refreshed)
    return refreshed


def _default_profile_document(user_id: str) -> dict[str, Any]:
    return {
        "user_id": user_id,
        "goal": None,
        "nationality": None,
        "current_location": None,
        "uk_presence": "unknown",
        "mentioned_facts": [],
        "preferred_style": "clear_step_by_step",
        "known_confusions": [],
        "intent_history": [],
        "tone_history": [],
        "psychological_notes": [],
        "topic_tags": [],
        "persona_bullets": [],
        "interaction_count": 0,
        "updated_at": datetime.now(timezone.utc),
    }


def _ensure_profile_defaults_inplace(doc: dict[str, Any]) -> None:
    defaults = _default_profile_document(str(doc.get("user_id", "")))
    for key, val in defaults.items():
        if key not in doc or doc[key] is None:
            doc[key] = val
        if key in (
            "known_confusions",
            "intent_history",
            "tone_history",
            "psychological_notes",
            "topic_tags",
            "persona_bullets",
            "mentioned_facts",
        ) and not isinstance(doc[key], list):
            doc[key] = []
        if doc.get("uk_presence") not in ("unknown", "outside_uk", "inside_uk"):
            doc["uk_presence"] = "unknown"


def apply_profile_delta(
    user_id: str,
    delta: dict[str, Any],
    *,
    bump_interaction_count: bool = True,
) -> dict[str, Any]:
    """Merge LLM-extracted delta into Mongo and return the refreshed profile."""
    if not delta:
        if bump_interaction_count:
            user_profiles_collection().update_one(
                {"user_id": user_id},
                {
                    "$inc": {"interaction_count": 1},
                    "$set": {"updated_at": datetime.now(timezone.utc)},
                },
                upsert=False,
            )
        return load_or_create_user_profile(user_id)

    collection = user_profiles_collection()
    doc = collection.find_one({"user_id": user_id}) or {}
    doc.pop("_id", None)
    _ensure_profile_defaults_inplace(doc)

    tone_hist = list(doc.get("tone_history") or [])
    for x in delta.get("tone_labels") or []:
        s = str(x).strip()
        if s and s not in tone_hist:
            tone_hist.append(s)
    tone_hist = tone_hist[-28:]

    psych_notes = list(doc.get("psychological_notes") or [])
    for x in delta.get("psychological_notes") or []:
        s = str(x).strip()
        if s and s not in psych_notes:
            psych_notes.append(s)
    psych_notes = psych_notes[-16:]

    topics = list(doc.get("topic_tags") or [])
    for x in delta.get("topic_tags") or []:
        s = str(x).strip().lower()
        if s and s not in topics:
            topics.append(s)
    topics = topics[-30:]

    bullets = list(doc.get("persona_bullets") or [])
    for x in delta.get("trait_bullets") or []:
        s = str(x).strip()
        if s and s not in bullets:
            bullets.append(s)
    bullets = bullets[-18:]

    facts = list(doc.get("mentioned_facts") or [])
    for x in delta.get("situational_bullets") or []:
        s = str(x).strip()
        if s and s not in facts:
            facts.append(s)
    facts = facts[-14:]

    interaction_count = int(doc.get("interaction_count") or 0)
    if bump_interaction_count:
        interaction_count += 1

    update: dict[str, Any] = {
        "tone_history": tone_hist,
        "psychological_notes": psych_notes,
        "topic_tags": topics,
        "persona_bullets": bullets,
        "mentioned_facts": facts,
        "interaction_count": interaction_count,
        "updated_at": datetime.now(timezone.utc),
    }

    ukp = delta.get("uk_presence")
    if isinstance(ukp, str) and ukp.strip().lower() in ("unknown", "outside_uk", "inside_uk"):
        update["uk_presence"] = ukp.strip().lower()

    nat = str(delta.get("nationality_guess") or "").strip()
    if nat and len(nat) < 120:
        update["nationality"] = nat

    loc = str(delta.get("location_summary") or "").strip()
    if loc and len(loc) < 280:
        update["current_location"] = loc

    comm = str(delta.get("communication_note") or "").strip().lower()
    if comm:
        if "concise" in comm or "direct_no_fluff" in comm or "no_fluff" in comm:
            update["preferred_style"] = "concise"
        elif "detailed" in comm or "step" in comm:
            update["preferred_style"] = "detailed_step_by_step"
        elif "plain" in comm or "simple" in comm:
            update["preferred_style"] = "plain_language"
        elif "warm" in comm or "reassur" in comm:
            update["preferred_style"] = "warm_reassuring"

    gh = str(delta.get("goal_hypothesis") or "").strip()
    if gh and len(gh) < 450:
        existing_goal = doc.get("goal")
        if not existing_goal or len(str(existing_goal)) < 12:
            update["goal"] = gh

    collection.update_one({"user_id": user_id}, {"$set": update}, upsert=True)
    return load_or_create_user_profile(user_id)


def update_user_profile_fields(user_id: str, fields: dict[str, Any]) -> None:
    if not fields:
        return
    fields["updated_at"] = datetime.now(timezone.utc)
    user_profiles_collection().update_one({"user_id": user_id}, {"$set": fields}, upsert=True)
