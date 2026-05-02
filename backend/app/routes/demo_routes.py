"""Before/after adaptive retrieval demo."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.agents.harness_controller import iter_demo_execution, run_demo
from app.logging_setup import get_logger
from app.schemas.request_models import DemoRunRequest
from app.schemas.response_models import DemoRunResponse
from app.util.json_api import encode_json_safe_payload
from app.util.sse_events import format_sse_line

router = APIRouter(prefix="/api/demo", tags=["demo"])
logger = get_logger("routes.demo")

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}


@router.post("/run", response_model=DemoRunResponse)
def run_before_after_demo(payload: DemoRunRequest) -> DemoRunResponse:
    try:
        result = run_demo(
            initial_query=payload.initial_query,
            follow_up_query=payload.follow_up_query,
            user_id=payload.user_id,
            extra_follow_ups=payload.extra_follow_ups,
        )
    except ValueError as exc:
        logger.warning("demo_validation_error user_id=%s error=%s", payload.user_id, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            "demo_run_failed user_id=%s initial_query_len=%s follow_up_len=%s",
            payload.user_id,
            len(payload.initial_query or ""),
            len(payload.follow_up_query or ""),
        )
        raise HTTPException(status_code=500, detail=f"Demo failed: {exc}") from exc
    safe_payload = encode_json_safe_payload(result)
    return DemoRunResponse(**safe_payload)


@router.post("/run/stream")
def stream_before_after_demo(payload: DemoRunRequest) -> StreamingResponse:
    """Server-Sent Events: incremental ``step_*``, ``transcript``, then ``done`` with full result."""

    def event_generator():
        try:
            for event in iter_demo_execution(
                initial_query=payload.initial_query,
                follow_up_query=payload.follow_up_query,
                user_id=payload.user_id,
                extra_follow_ups=payload.extra_follow_ups,
            ):
                yield format_sse_line(event)
        except ValueError as exc:
            logger.warning("demo_stream_validation user_id=%s error=%s", payload.user_id, exc)
            yield format_sse_line({"type": "error", "detail": str(exc)})
        except Exception as exc:
            logger.exception(
                "demo_stream_failed user_id=%s",
                payload.user_id,
            )
            yield format_sse_line({"type": "error", "detail": f"Demo failed: {exc}"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
