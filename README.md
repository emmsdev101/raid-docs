# RaidDocs

Enterprise knowledge base and compliance assistant: upload documents, index them with embeddings, search by name or meaning, and ask grounded questions with citations.

```
raid-docs/
├── backend/    FastAPI + PostgreSQL (asyncpg) + Celery + Ollama
└── frontend/   Next.js app (dashboard, search, ask, documents, audits)
```

## Prerequisites

- Python 3.12+
- Node.js 20+
- PostgreSQL with `pgcrypto` and `vector` (pgvector)
- Redis (optional locally — set `CELERY_ENABLED=false` to ingest inline)
- [Ollama](https://ollama.com) with embedding + chat models (e.g. `nomic-embed-text`, `llama3.1:8b`)

## Backend

Details: [`backend/README.md`](./backend/README.md) · layout: [`backend/structure.md`](./backend/structure.md)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # PowerShell / Windows
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
copy .env.example .env            # or: cp .env.example .env

python -m scripts.migrate

uvicorn app.main:app --reload --port 8000
```

Workers (when `CELERY_ENABLED=true`):

```bash
# Windows needs --pool=solo
celery -A app.core.celery_app worker --loglevel=info --pool=solo
celery -A app.core.celery_app beat --loglevel=info
```

API base: `http://localhost:8000/api/v1` · health: `http://localhost:8000/health`

Auth is email/password with JWT (`JWT_SECRET_KEY` in `.env`). Optional Clerk JWKS mode is documented in `backend/.env.example`.

## Frontend

```bash
cd frontend
npm install
copy .env.local.example .env.local   # or: cp .env.local.example .env.local
npm run dev
```

App: `http://localhost:3000`  
Set `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1` in `.env.local`.

### Main surfaces

| Route | Purpose |
|-------|---------|
| `/search` | Document search engine + AI insight |
| `/ask` | Conversational RAG with citations |
| `/documents` | Upload, status, document detail |
| `/audits` | Compliance audits |
| `/login`, `/register` | Auth |

## Typical local flow

1. Start Postgres (and Redis if using Celery).
2. Start Ollama and pull models.
3. Run migrations and the API (and worker/beat if needed).
4. Start the Next.js app and register a user.
5. Upload a document, wait until status is `READY`, then search or ask.
