"""Fetch and persist GOV.UK Skilled Worker visa pages with robust extraction."""

from __future__ import annotations

import time
from datetime import datetime, timezone

import httpx

from app.database.mongodb_client import visa_knowledge_collection
from app.ingestion.chunker import chunk_text_semantic, make_chunk_id
from app.ingestion.text_cleaner import discover_skilled_worker_urls, html_to_plain_text
from app.logging_setup import get_logger
from app.services.embedding_service import embed_text
from bs4 import BeautifulSoup

logger = get_logger("ingestion.govuk")

USER_AGENT = "EvoVisaHackathonDemo/1.1 (+https://www.gov.uk/skilled-worker-visa; policy ingest)"

# Curated seeds — hub first for discovery; remainder cover common subtopics even if discovery misses.
DEFAULT_SKILLED_WORKER_URLS: list[str] = [
    "https://www.gov.uk/skilled-worker-visa",
    "https://www.gov.uk/skilled-worker-visa/eligibility",
    "https://www.gov.uk/skilled-worker-visa/how-to-apply",
    "https://www.gov.uk/skilled-worker-visa/documents-you-must-provide",
    "https://www.gov.uk/skilled-worker-visa/knowledge-of-english",
    "https://www.gov.uk/skilled-worker-visa/how-long-you-can-stay",
    "https://www.gov.uk/skilled-worker-visa/extending-your-visa",
    "https://www.gov.uk/skilled-worker-visa/switch-to-this-visa",
    "https://www.gov.uk/skilled-worker-visa/if-your-application-is-successful",
    "https://www.gov.uk/skilled-worker-visa/your-employment",
    "https://www.gov.uk/skilled-worker-visa/when-you-can-be-paid-less",
    "https://www.gov.uk/skilled-worker-visa/travel-abroad",
    "https://www.gov.uk/skilled-worker-visa/your-partner-and-children",
    "https://www.gov.uk/healthcare-immigration-application",
    "https://www.gov.uk/apply-sponsor-licence",
]

MIN_PLAIN_TEXT_CHARS = 120
FETCH_RETRIES = 3
RETRY_BASE_DELAY_S = 0.6


def _normalize_urls(urls: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in urls:
        u = raw.strip().split("#")[0].rstrip("/")
        if not u or u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def _resolve_url_set(
    seed_urls: list[str],
    *,
    expand_related_links: bool,
    max_pages: int,
) -> list[str]:
    seeds = _normalize_urls(seed_urls)
    if not expand_related_links:
        return seeds[:max_pages]

    discovered: set[str] = set(seeds)
    for seed in seeds[:5]:
        try:
            html, _final = _fetch_page_raw(seed)
        except Exception as exc:
            logger.warning("discover_fetch_failed url=%s error=%s", seed, exc)
            continue
        for link in discover_skilled_worker_urls(html, limit=80):
            discovered.add(link.rstrip("/"))

    # Hub first, then rest alphabetically for stable runs.
    ordered: list[str] = []
    for s in seeds:
        if s in discovered and s not in ordered:
            ordered.append(s)
    for u in sorted(discovered):
        if u not in ordered:
            ordered.append(u)
    return ordered[:max_pages]


def _fetch_page_raw(url: str) -> tuple[str, str]:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
    }
    last_error: Exception | None = None
    for attempt in range(FETCH_RETRIES):
        try:
            with httpx.Client(timeout=45.0, follow_redirects=True) as client:
                response = client.get(url, headers=headers)
                response.raise_for_status()
                return response.text, str(response.url)
        except Exception as exc:
            last_error = exc
            time.sleep(RETRY_BASE_DELAY_S * (2**attempt))
    assert last_error is not None
    raise last_error


def _page_title(html: str, final_url: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    if soup.title and soup.title.string:
        t = soup.title.string.strip()
        if t:
            return t
    return final_url.rstrip("/").split("/")[-1].replace("-", " ").title()


def ingest_urls(
    urls: list[str],
    *,
    expand_related_links: bool = True,
    max_pages: int = 45,
) -> int:
    """
    Fetch pages, extract GOV.UK main content, semantic-chunk, embed, upsert into ``visa_knowledge``.

    When ``expand_related_links`` is True, crawl in-page links under ``/skilled-worker-visa``
    from the first few seeds (bounded by ``max_pages``).
    """
    collection = visa_knowledge_collection()
    now = datetime.now(timezone.utc)
    targets = _resolve_url_set(urls, expand_related_links=expand_related_links, max_pages=max_pages)

    inserted_count = 0
    pages_ok = 0
    pages_skipped = 0

    for final_url in targets:
        try:
            html, resolved_url = _fetch_page_raw(final_url)
        except Exception as exc:
            logger.warning("page_fetch_failed url=%s error=%s", final_url, exc)
            continue

        page_title = _page_title(html, resolved_url)
        plain = html_to_plain_text(html, title_fallback=page_title, govuk=True)

        if len(plain) < MIN_PLAIN_TEXT_CHARS:
            logger.warning(
                "page_low_content url=%s chars=%s title=%s",
                resolved_url,
                len(plain),
                page_title[:80],
            )
            pages_skipped += 1
            continue

        chunks = chunk_text_semantic(plain, max_chars=1550, overlap=220)
        if not chunks:
            pages_skipped += 1
            continue

        pages_ok += 1
        for index, chunk_body in enumerate(chunks):
            chunk_id = make_chunk_id(resolved_url, index, chunk_body)
            embed_payload = f"{page_title}\nSource: {resolved_url}\n\n{chunk_body}"
            embedding = embed_text(embed_payload)
            document = {
                "chunk_id": chunk_id,
                "chunk_index": index,
                "title": page_title,
                "visa_route": "Skilled Worker",
                "content": chunk_body,
                "source_url": resolved_url,
                "last_checked_at": now,
                "embedding": embedding,
                "embedding_model_hint": "title+url+body",
            }
            collection.update_one(
                {"chunk_id": chunk_id},
                {"$set": document},
                upsert=True,
            )
            inserted_count += 1

    logger.info(
        "ingest_summary targets=%s pages_ok=%s pages_skipped_low_or_empty=%s chunks_upserted=%s",
        len(targets),
        pages_ok,
        pages_skipped,
        inserted_count,
    )
    return inserted_count
