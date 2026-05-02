"""Shared evaluation entrypoint for routes and harness."""

from __future__ import annotations

from typing import Any

from app.agents.evaluator_agent import evaluate_answer_with_context
from app.evaluation.scoring import normalise_evaluation_payload


def run_evaluation(user_query: str, answer: str, govuk_chunks: list[dict[str, Any]]) -> dict[str, Any]:
    raw_evaluation = evaluate_answer_with_context(user_query, answer, govuk_chunks)
    return normalise_evaluation_payload(raw_evaluation)
