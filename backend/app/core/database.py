"""Async PostgreSQL access via `asyncpg` — no ORM.

Exposes a lazily-initialised connection pool and small helpers so the rest
of the app can `async with get_pool().acquire() as conn: ...` or take a
FastAPI dependency (`get_connection`).

Lifecycle is driven from `app.main.lifespan`:
    - startup  -> `init_db()`   creates the pool
    - shutdown -> `dispose_engine()` closes it
"""

from __future__ import annotations

import logging
from typing import AsyncIterator

import asyncpg

from app.config import settings

log = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def _init_connection(conn: asyncpg.Connection) -> None:
    """Per-connection setup. Registers the pgvector codec if available."""
    try:
        from pgvector.asyncpg import register_vector

        await register_vector(conn)
    except Exception:
        # pgvector extension not installed in this DB — safe to skip.
        log.debug("pgvector codec not registered", exc_info=True)


async def init_db() -> None:
    """Create the global connection pool (idempotent)."""
    global _pool
    if _pool is not None:
        return

    _pool = await asyncpg.create_pool(
        dsn=str(settings.database_url),
        min_size=1,
        max_size=10,
        command_timeout=30,
        init=_init_connection,
    )
    log.info("PostgreSQL pool ready")


async def dispose_engine() -> None:
    """Close the pool on shutdown (idempotent)."""
    global _pool
    if _pool is None:
        return
    await _pool.close()
    _pool = None
    log.info("PostgreSQL pool closed")


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError(
            "Database pool is not initialised. "
            "Ensure init_db() has run (via app lifespan or manually)."
        )
    return _pool


async def get_connection() -> AsyncIterator[asyncpg.Connection]:
    """FastAPI dependency yielding a pooled connection.

    Example:
        @router.get("/documents")
        async def list_docs(conn: asyncpg.Connection = Depends(get_connection)):
            return await conn.fetch('SELECT * FROM "Document"')
    """
    async with get_pool().acquire() as conn:
        yield conn
