"""API request bodies."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class GovUkIngestRequest(BaseModel):
    urls: list[str] | None = None
    expand_related_links: bool = Field(
        True,
        description="Follow in-page /skilled-worker-visa links from seeds (bounded by max_pages).",
    )
    max_pages: int = Field(45, ge=1, le=80, description="Upper bound on distinct GOV.UK pages per ingest run.")


class DemoRunRequest(BaseModel):
    user_id: str = "demo_user"
    initial_query: str = "I want to work in the UK. What should I do?"
    follow_up_query: str = "Do I need sponsorship for a UK work visa?"
    extra_follow_ups: list[str] = Field(
        default_factory=list,
        description="Extra user messages after follow_up_query (max 4); conversation continues with memory on.",
    )

    @field_validator("extra_follow_ups", mode="before")
    @classmethod
    def _normalise_extra_follow_ups(cls, value: object) -> list[str]:
        if not value:
            return []
        if not isinstance(value, list):
            return []
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        return cleaned[:4]


class ChatRequest(BaseModel):
    user_id: str = "demo_user"
    query: str


class KnowledgePurgeRequest(BaseModel):
    """Destructive: clears visa_knowledge. `confirm` must match the server phrase (see /api/knowledge/meta)."""

    confirm: str = Field(..., min_length=1)
