"""Chat endpoint using LangGraph-wrapped memory harness."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.agents.harness_controller import build_simple_chat_graph, iter_chat_execution
from app.logging_setup import get_logger
from app.schemas.request_models import ChatRequest
from app.schemas.response_models import ChatResponse
from app.util.json_api import encode_json_safe_payload
from app.util.sse_events import format_sse_line

router = APIRouter(prefix="/api", tags=["chat"])
logger = get_logger("routes.chat")

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}

_chat_graph = None


def get_chat_graph():
    global _chat_graph
    if _chat_graph is None:
        _chat_graph = build_simple_chat_graph()
    return _chat_graph


@router.post("/chat", response_model=ChatResponse)
def chat_with_memory(payload: ChatRequest) -> ChatResponse:
    try:
        graph_state = get_chat_graph().invoke({"user_id": payload.user_id, "query": payload.query})
        result = graph_state.get("result") or {}
    except ValueError as exc:
        logger.warning("chat_validation_error user_id=%s error=%s", payload.user_id, exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception(
            "chat_failed user_id=%s query_len=%s",
            payload.user_id,
            len(payload.query or ""),
        )
        raise HTTPException(status_code=500, detail=f"Chat failed: {exc}") from exc
    safe_payload = encode_json_safe_payload(result)
    return ChatResponse(**safe_payload)


@router.post("/chat/stream")
def chat_with_memory_stream(payload: ChatRequest) -> StreamingResponse:
    """SSE: same harness as POST /chat, with incremental ``step_*`` / ``transcript`` events."""

    def event_generator():
        try:
            for event in iter_chat_execution(payload.user_id, payload.query):
                yield format_sse_line(event)
        except ValueError as exc:
            logger.warning("chat_stream_validation user_id=%s error=%s", payload.user_id, exc)
            yield format_sse_line({"type": "error", "detail": str(exc)})
        except Exception as exc:
            logger.exception("chat_stream_failed user_id=%s", payload.user_id)
            yield format_sse_line({"type": "error", "detail": f"Chat failed: {exc}"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
