"""Normalise evaluator scores to a consistent 0–30 total."""

from __future__ import annotations

from typing import Any

# Canonical dimension → alternate JSON keys models sometimes emit.
_DIMENSION_ALIASES: dict[str, tuple[str, ...]] = {
    "accuracy": ("accuracy",),
    "completeness": ("completeness",),
    "clarity": ("clarity",),
    "personalisation": ("personalisation", "personalization"),
    "actionability": ("actionability",),
    "safety": ("safety", "safety_legal", "legal_disclaimer", "safety_disclaimer"),
}


def clamp_dimension(value: object) -> int:
    try:
        numeric = int(float(value))
    except (TypeError, ValueError):
        return 0
    return max(0, min(5, numeric))


def _pick_raw_dimension(payload: dict[str, Any], canonical: str) -> object:
    for key in _DIMENSION_ALIASES.get(canonical, (canonical,)):
        if key in payload and payload[key] is not None:
            return payload[key]
    return 0


def normalise_evaluation_payload(payload: dict[str, Any]) -> dict[str, Any]:
    dimensions = [
        "accuracy",
        "completeness",
        "clarity",
        "personalisation",
        "actionability",
        "safety",
    ]
    normalised = dict(payload)
    for key in dimensions:
        normalised[key] = clamp_dimension(_pick_raw_dimension(payload, key))
    recomputed_total = sum(int(normalised[key]) for key in dimensions)
    # Models often emit a stale or arbitrary total_score; rubric is six × 0–5 only.
    normalised["total_score"] = max(0, min(30, recomputed_total))
    normalised.setdefault("missing_points", [])
    normalised.setdefault("reason", "")
    if not isinstance(normalised["missing_points"], list):
        normalised["missing_points"] = []
    return normalised
