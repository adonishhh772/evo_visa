"""Request correlation, timing, and structured request lifecycle logs."""

from __future__ import annotations

import time
import uuid

from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.logging_setup import get_logger

logger = get_logger("request")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs each request, attaches X-Request-ID, and returns JSON for unhandled errors."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        start_time = time.perf_counter()
        path = request.url.path

        logger.info(
            "request_start method=%s path=%s client=%s request_id=%s",
            request.method,
            path,
            request.client.host if request.client else "-",
            request_id,
        )

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "unhandled_exception method=%s path=%s request_id=%s",
                request.method,
                path,
                request_id,
            )
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal server error",
                    "request_id": request_id,
                },
            )

        duration_ms = (time.perf_counter() - start_time) * 1000
        response.headers["X-Request-ID"] = request_id

        logger.info(
            "request_complete method=%s path=%s status=%s duration_ms=%.2f request_id=%s",
            request.method,
            path,
            response.status_code,
            duration_ms,
            request_id,
        )
        return response
