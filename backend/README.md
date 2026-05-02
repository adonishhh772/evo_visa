# EvoVisa Backend

FastAPI service implementing the adaptive retrieval harness, GOV.UK ingestion, and MongoDB memory layers.

## Quick start

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

See the repository root `README.md` for architecture narrative, Atlas vector index notes, and LangSmith configuration.

### Logging

- Set `LOG_LEVEL` (`DEBUG`, `INFO`, `WARNING`, `ERROR`) in `.env`; default is `INFO`.
- Each request logs start/complete with duration and `X-Request-ID` (also returned on responses).
- Route handlers log validation issues at `WARNING` and failures with stack traces at `ERROR`.
- Uncaught exceptions return JSON `500` with `request_id` and are logged with full traceback.

### Primary endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/ingest/govuk` | Scrape & chunk GOV.UK pages |
| GET | `/api/knowledge/meta` | Default URLs + embedding model |
| GET | `/api/knowledge/stats` | Chunk counts by source URL |
| GET | `/api/knowledge/chunks` | Paginated chunk store (no raw vectors) |
| GET | `/api/knowledge/chunks/{id}` | Chunk detail + short embedding preview |
| POST | `/api/knowledge/purge` | Delete all `visa_knowledge` docs (`confirm` phrase required) |
| POST | `/api/demo/run` | Before/after adaptive demo |
| POST | `/api/chat` | Memory-enabled chat (LangGraph) |
| GET | `/api/memories` | Semantic memories |
| GET | `/api/evaluation-runs` | Stored demo runs |
