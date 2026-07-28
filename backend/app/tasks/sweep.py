from __future__ import annotations
import asyncio
import asyncpg
from app.config import settings
from app.core.celery_app import celery_app
from app.tasks.ingestion import process_document


@celery_app.task(name="tasks.sweep.sweep_stuck_documents")
def sweep_stuck_documents() -> dict:
    return asyncio.run(_sweep_stuck_documents())


async def _sweep_stuck_documents() -> dict:
    conn = await asyncpg.connect(dsn=str(settings.database_url))
    try:
        pending_age = settings.ingestion_pending_min_age_seconds
        stale_min = settings.ingestion_processing_stale_minutes

        # Reset abandoned PROCESSING jobs
        reset = await conn.fetch(
            """
            UPDATE "Document"
            SET "status" = 'PENDING'::"DocStatus"
            WHERE "status" = 'PROCESSING'::"DocStatus"
              AND "updatedAt" < NOW() - ($1 || ' minutes')::interval
            RETURNING "id"
            """,
            str(stale_min),
        )

        # Re-enqueue aged PENDING (includes ones we just reset)
        rows = await conn.fetch(
            """
            SELECT "id" FROM "Document"
            WHERE "status" = 'PENDING'::"DocStatus"
              AND "createdAt" < NOW() - ($1 || ' seconds')::interval
            ORDER BY "createdAt" ASC
            LIMIT 50
            """,
            str(pending_age),
        )

        for row in rows:
            process_document.delay(str(row["id"]))

        return {
            "reset_processing": len(reset),
            "enqueued": len(rows),
        }
    finally:
        await conn.close()