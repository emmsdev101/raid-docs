# RAID Docs — Backend

FastAPI + raw PostgreSQL (`asyncpg`) + Celery + Ollama (local LLM/embeddings).
No ORM. No Alembic. Schema lives in plain SQL under `migrations/`.

## Layout

See [`structure.md`](./structure.md) for the canonical directory layout.

## Quickstart

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # PowerShell
pip install -r requirements.txt
copy .env.example .env

# 1. Start Postgres and Redis (Postgres needs the `pgcrypto` extension,
#    plus `vector` if you plan to store embeddings in Postgres).
# 2. Apply migrations:
python -m scripts.migrate

# 3. Run the API:
uvicorn app.main:app --reload --port 8000

# 4. In a separate shell, run the worker:
celery -A app.core.celery_app worker --loglevel=info

# 5. Run celery beat
celery -A app.core.celery_app beat --loglevel=info
```


The API is served under `/api/v1` and a health probe lives at `/health`.

## Auth

- Production: set `CLERK_JWKS_URL` (and optionally `JWT_AUDIENCE` / `JWT_ISSUER`).
- Development: leave `CLERK_JWKS_URL` unset — every request is treated as
  a fixed dev user. **Never** deploy with `APP_ENV=development`.

## Migrations

Schema changes are plain `.sql` files under `backend/migrations/`, applied
in filename order by a tiny runner. There is no autogeneration — write the
SQL yourself, which is the point of dropping the ORM.

```bash
# Show status
python -m scripts.migrate --status

# Apply pending migrations
python -m scripts.migrate

# Adopt the runner against a DB that already matches the schema
# (records every pending file as applied without executing its SQL)
python -m scripts.migrate --baseline
```

Naming convention: `NNN_short_description.sql` (e.g. `002_add_teams.sql`).
Once a migration has been applied on any environment, **never edit it** —
add a new file instead. The runner stores a SHA-256 of every applied file
and will warn you loudly if one has been mutated.

## Database access from code

```python
from fastapi import Depends
import asyncpg
from app.core.database import get_connection

@router.get("/documents")
async def list_docs(conn: asyncpg.Connection = Depends(get_connection)):
    rows = await conn.fetch(
        'SELECT id, title, status FROM "Document" WHERE "organizationId" = $1',
        org_id,
    )
    return [dict(r) for r in rows]
```

Table and column identifiers are quoted PascalCase / camelCase to stay
compatible with the reference Prisma schema. Always quote them in SQL.
