"""Document ingestion pipeline: parse → chunk → embed → persist.

The same async pipeline (`run_pipeline`) is used in two contexts:

1. **Inline** (default, `CELERY_ENABLED=false`) — the FastAPI upload endpoint
   registers the pipeline as a `BackgroundTask` so it runs *after* the HTTP
   response is sent, in the same process as the API. No Redis required.

2. **Celery** (`CELERY_ENABLED=true`) — the API publishes a task to Redis
   and a `celery -A app.core.celery_app worker` process picks it up. This
   is the right choice once ingestion becomes CPU-heavy or you want the
   API to stay responsive during large batches.

Chunks are stored with a local `vectorId` plus a pgvector `embedding`
column (768-dim, from Ollama `nomic-embed-text`).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import List

import asyncpg
from fastapi import BackgroundTasks
from pgvector.asyncpg import register_vector

from app.config import settings
from app.core.celery_app import celery_app
from app.services.chunker import Chunk, chunk_text
from app.services.embeddings import embed_texts
from app.services.parser import parse_document

log = logging.getLogger(__name__)


# ── Public entrypoint used by the upload endpoint ─────────────────────
def enqueue_ingestion(
    document_id: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Kick off ingestion for `document_id`.

    Chooses between Celery and inline execution based on `CELERY_ENABLED`.
    When Celery is enabled but its broker is unreachable, we automatically
    fall back to inline execution so a missing Redis never causes a 500 on
    upload.
    """
    if settings.celery_enabled:
        try:
            process_document.delay(document_id)
            return
        except Exception as exc:  # pragma: no cover - broker-down path
            log.warning(
                "Celery broker unreachable (%s); running ingestion inline "
                "for document %s. Set CELERY_ENABLED=false to silence this.",
                exc,
                document_id,
            )

    _run_inline(document_id, background_tasks)


def _run_inline(
    document_id: str,
    background_tasks: BackgroundTasks | None,
) -> None:
    """Schedule the pipeline to run after the current response is sent."""
    if background_tasks is not None:
        background_tasks.add_task(_run_pipeline_sync, document_id)
        return

    # Fallback when no BackgroundTasks were provided (e.g. called from a
    # script). Run detached in the current event loop.
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None:
        loop.create_task(run_pipeline(uuid.UUID(document_id)))
    else:
        asyncio.run(run_pipeline(uuid.UUID(document_id)))


def _run_pipeline_sync(document_id: str) -> None:
    """Sync wrapper used by BackgroundTasks (runs in a threadpool)."""
    try:
        asyncio.run(run_pipeline(uuid.UUID(document_id)))
    except Exception:
        log.exception("Inline ingestion failed for document %s", document_id)


# ── Celery task (only used when CELERY_ENABLED=true) ──────────────────
@celery_app.task(name="ingestion.process_document", bind=True, max_retries=3)
def process_document(self, document_id: str) -> dict:  # type: ignore[no-untyped-def]
    """Celery entrypoint — synchronous wrapper around the async pipeline."""
    try:
        return asyncio.run(run_pipeline(uuid.UUID(document_id)))
    except Exception as exc:  # pragma: no cover - retry path
        raise self.retry(
            exc=exc,
            countdown=min(60 * (self.request.retries + 1), 600),
        )


# ── Core pipeline (usable from Celery or inline) ──────────────────────
async def run_pipeline(document_id: uuid.UUID) -> dict:
    """Fetch the document, extract text, chunk it, embed, persist."""
    conn = await asyncpg.connect(dsn=str(settings.database_url))
    try:
        await register_vector(conn)

        document = await conn.fetchrow(
            'SELECT "id", "fileUrl" FROM "Document" WHERE "id" = $1',
            document_id,
        )
        if document is None:
            return {"document_id": str(document_id), "status": "missing"}

        await conn.execute(
            'UPDATE "Document" SET "status" = $1::"DocStatus" WHERE "id" = $2',
            "PROCESSING",
            document_id,
        )

        try:
            text = parse_document(document["fileUrl"])
            chunks: List[Chunk] = chunk_text(text)
            vectors = await embed_texts([c.text for c in chunks]) if chunks else []

            async with conn.transaction():
                await conn.execute(
                    'DELETE FROM "DocumentChunk" WHERE "documentId" = $1',
                    document_id,
                )
                if chunks:
                    await conn.executemany(
                        """
                        INSERT INTO "DocumentChunk" (
                            "id", "documentId", "content",
                            "pageNumber", "chunkIndex", "vectorId",
                            "embedding"
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        """,
                        [
                            (
                                uuid.uuid4(),
                                document_id,
                                chunk.text,
                                1,
                                chunk.index,
                                f"local:{document_id}:{chunk.index}",
                                vector,
                            )
                            for chunk, vector in zip(chunks, vectors, strict=True)
                        ],
                    )

                # If the parser produced no text we still mark READY (there
                # was nothing to index). FAILED is reserved for real errors.
                await conn.execute(
                    'UPDATE "Document" SET "status" = $1::"DocStatus" '
                    'WHERE "id" = $2',
                    "READY",
                    document_id,
                )

            log.info(
                "Ingestion complete for document %s: %d chunks",
                document_id,
                len(chunks),
            )
            return {
                "document_id": str(document_id),
                "status": "READY",
                "chunks": len(chunks),
            }
        except Exception:
            await conn.execute(
                'UPDATE "Document" SET "status" = $1::"DocStatus" '
                'WHERE "id" = $2',
                "FAILED",
                document_id,
            )
            log.exception("Ingestion failed for document %s", document_id)
            raise
    finally:
        await conn.close()
