backend/
├── app/
│   ├── __init__.py
│   ├── main.py                # FastAPI initialization & middleware
│   ├── config.py              # Pydantic BaseSettings (env variables)
│   │
│   ├── api/                   # API Route Handlers
│   │   ├── __init__.py
│   │   ├── router.py          # Master API router
│   │   └── v1/
│   │       ├── documents.py   # Upload, delete, status endpoints
│   │       ├── chat.py        # RAG query & streaming endpoints
│   │       └── audits.py      # Compliance auditing endpoints
│   │
│   ├── core/                  # Cross-cutting infrastructure
│   │   ├── database.py        # asyncpg pool (raw PostgreSQL, no ORM)
│   │   ├── security.py        # Auth token verification (JWT / Clerk)
│   │   └── celery_app.py      # Celery / Redis queue setup
│   │
│   ├── repositories/          # Data access layer — raw SQL per aggregate
│   │   ├── organization.py    # e.g. get_by_id, create, list_users
│   │   ├── document.py
│   │   └── audit.py
│   │
│   ├── schemas/               # Pydantic schemas (request / response DTOs
│   │   ├── document.py        # + row shapes returned from repositories)
│   │   ├── chat.py
│   │   └── audit.py
│   │
│   ├── services/              # Pure AI & processing logic
│   │   ├── parser.py          # PDF / DOCX text extraction
│   │   ├── chunker.py         # Text splitting logic
│   │   ├── embeddings.py      # Embedding generation (Ollama / local models)
│   │   └── rag.py             # Vector search + LLM prompt building
│   │
│   └── tasks/                 # Background worker tasks
│       └── ingestion.py       # Async pipeline: parse -> chunk -> vectorize
│
├── migrations/                # Plain-SQL schema migrations
│   └── 001_initial.sql        # Applied in filename order
│
├── scripts/
│   └── migrate.py             # Tiny runner: `python -m scripts.migrate`
│
├── requirements.txt
├── .env.example
└── README.md
