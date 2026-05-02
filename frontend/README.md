# EvoVisa Frontend

Next.js 14 + TypeScript + Tailwind dashboard for the hackathon demo.

## Setup

```bash
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

Point `NEXT_PUBLIC_API_BASE_URL` at your FastAPI host (default `http://127.0.0.1:8000`).

## Available scripts

- `npm run dev` — local development
- `npm run build` — production build
- `npm run start` — serve production build

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Chat-style adaptive assistant |
| `/demo` | Before/after harness |
| `/knowledge` | GOV.UK URL ingest & chunk browser |
| `/flow` | Architecture diagram |
| `/insights` | MongoDB memories & evaluation runs |

Refer to the repository root `README.md` for the full EvoVisa story and backend instructions.
