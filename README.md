# EvoVisa — Adaptive Retrieval Multi-Agent Harness

This is not a basic RAG chatbot. EvoVisa is an adaptive retrieval agentic harness where multiple agents collaborate to retrieve, answer, evaluate, reflect, store learned memories, and improve future responses using MongoDB.

EvoVisa focuses on **UK Skilled Worker visa** guidance using **official GOV.UK content** only. Outputs are **general guidance, not legal advice**.

## Why this fits **Adaptive Retrieval**

- Baseline answers use GOV.UK chunks only.
- An **evaluator agent** scores answers across six dimensions (0–5 each, 30 total).
- A **reflection agent** turns gaps into a **semantic memory** with embeddings stored in MongoDB.
- The **retrieval agent** re-ranks memories using similarity plus **usage**, **historical score lift**, and **query-theme boosts** (for example documents or sponsorship).
- Prior evaluator signals shift weights (for example low accuracy prioritises GOV.UK; low completeness boosts strategies).

## Why this fits **Multi-Agent Collaboration**

Distinct agents cooperate in one harness:

1. **Retrieval agent** — adaptive blending of GOV.UK, semantic memory, episodic memory, profile context.
2. **Visa consultant agent** — grounded answers with disclaimers.
3. **Evaluator agent** — structured JSON scoring and missing points.
4. **Reflection agent** — reusable strategy extraction.

LangGraph wires the interactive `/api/chat` path; the hackathon demo orchestrates an explicit before/after pipeline with LangSmith-named spans when configured.

## How **MongoDB** is used

| Collection | Role |
| --- | --- |
| `visa_knowledge` | Chunked GOV.UK pages + embeddings |
| `semantic_memories` | Learned strategies + embeddings + effectiveness metrics |
| `episodic_memories` | Past interactions for the same user |
| `user_profiles` | Light personalisation fields |
| `evaluation_runs` | Demo transcripts and retrieval traces |

## Environment variables

### Backend (`backend/.env`)

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required for chat, embeddings, evaluations |
| `MONGODB_URI` | MongoDB connection string (Atlas sandbox recommended) |
| `MONGODB_DATABASE_NAME` | Database name (default `evo_visa`) |
| `LANGSMITH_API_KEY` | Optional tracing |
| `LANGSMITH_PROJECT` | LangSmith project name |

### Frontend (`frontend/.env.local`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | FastAPI base URL, e.g. `http://127.0.0.1:8000` |

## Run the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell
pip install -r requirements.txt
copy .env.example .env          # fill in secrets
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Health check: `GET http://127.0.0.1:8000/api/health`

## Run the frontend

```bash
cd frontend
copy .env.local.example .env.local   # adjust API URL if needed
npm install
npm run dev
```

Open `http://localhost:3000`. Use **Knowledge** in the sidebar to manage GOV.UK URLs, run ingest, and browse chunks with citations and embedding metadata.

## Ingest GOV.UK data

With the backend running:

```bash
curl -X POST http://127.0.0.1:8000/api/ingest/govuk -H "Content-Type: application/json" -d "{}"
```

Empty body uses default Skilled Worker URLs. Optional body:

```json
{ "urls": ["https://www.gov.uk/skilled-worker-visa"] }
```

## Run the hackathon demo

1. Open the dashboard (`npm run dev`).
2. Confirm ingestion has populated `visa_knowledge`.
3. Click **Run demo**.
4. Narrate: baseline score → evaluator gaps → MongoDB memory → adaptive trace → improved score — **without fine-tuning**.

API equivalent: `POST /api/demo/run` with `user_id`, `initial_query`, `follow_up_query`.

## Atlas Vector Search (optional)

The backend **falls back to local cosine similarity** over stored embeddings so demos work immediately. For Atlas Vector Search, create indexes in the Atlas UI, for example:

**Collection `visa_knowledge` — vector index on `embedding`** (dimension matches `text-embedding-3-small`: 1536)

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    }
  ]
}
```

**Collection `semantic_memories` — vector index on `embedding`** (same dimensions)

After indexes exist, you can swap retrieval calls to `$vectorSearch` for production; the README documents intent while the repo ships the cosine fallback for reliability during judging.

## LangSmith tracing

When `LANGSMITH_API_KEY` is present, tracing is enabled automatically. Named spans include:

- `retrieve_context`
- `generate_answer_without_memory`
- `evaluate_without_memory`
- `create_learning_memory`
- `retrieve_adaptive_memory`
- `generate_answer_with_memory`
- `evaluate_with_memory`
- `store_evaluation_run`

## What was built for the hackathon

- FastAPI service with ingest, demo, chat, memories, and evaluation history endpoints.
- Mongo-backed knowledge + memory layers with adaptive retrieval scoring.
- Next.js + Tailwind dashboard showing before/after scores, evaluator breakdown, learned memory, retrieval trace, reused memories, flow narrative, and optional chat.
- LangGraph chat compilation plus LangSmith hooks on the harness.

## Disclaimer

EvoVisa provides general information about the Skilled Worker route based on supplied GOV.UK text. It is **not immigration legal advice**. Users must verify requirements on GOV.UK and consult qualified advisers for decisions.
