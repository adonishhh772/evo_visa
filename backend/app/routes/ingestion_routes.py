"""GOV.UK ingestion endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.ingestion.govuk_ingestion import DEFAULT_SKILLED_WORKER_URLS, ingest_urls
from app.logging_setup import get_logger
from app.schemas.request_models import GovUkIngestRequest
from app.schemas.response_models import GovUkIngestResponse

router = APIRouter(prefix="/api/ingest", tags=["ingestion"])
logger = get_logger("routes.ingestion")


@router.post("/govuk", response_model=GovUkIngestResponse)
def ingest_govuk_skilled_worker(payload: GovUkIngestRequest) -> GovUkIngestResponse:
    urls = payload.urls if payload.urls else DEFAULT_SKILLED_WORKER_URLS
    if not urls:
        logger.warning("ingest_rejected_empty_url_list")
        raise HTTPException(status_code=400, detail="No URLs supplied and no defaults configured.")
    try:
        inserted = ingest_urls(
            urls,
            expand_related_links=payload.expand_related_links,
            max_pages=payload.max_pages,
        )
        logger.info("ingest_complete url_count=%s chunks_inserted=%s", len(urls), inserted)
    except Exception as exc:
        logger.exception("ingest_failed url_count=%s", len(urls))
        raise HTTPException(status_code=500, detail=f"Ingest failed: {exc}") from exc
    return GovUkIngestResponse(status="success", chunks_inserted=inserted)
