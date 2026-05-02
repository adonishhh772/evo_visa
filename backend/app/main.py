"""FastAPI entrypoint for EvoVisa."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.indexes import ensure_regular_indexes
from app.logging_setup import configure_application_logging, get_logger
from app.middleware.request_logging import RequestLoggingMiddleware
from app.routes import chat_routes, demo_routes, ingestion_routes, knowledge_routes, memory_routes

configure_application_logging()
logger = get_logger("main")


@asynccontextmanager
async def lifespan(application: FastAPI):
    logger.info("lifespan_startup indexes_begin")
    ensure_regular_indexes()
    logger.info("lifespan_startup indexes_ready")
    yield
    logger.info("lifespan_shutdown")


app = FastAPI(title="EvoVisa API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(ingestion_routes.router)
app.include_router(knowledge_routes.router)
app.include_router(demo_routes.router)
app.include_router(chat_routes.router)
app.include_router(memory_routes.router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
