"""Compliance audit pipeline: LLM analysis → persist findings.

Mirrors the ingestion enqueue pattern:

1. **Inline** (`CELERY_ENABLED=false`) — FastAPI `BackgroundTasks` after response.
2. **Celery** (`CELERY_ENABLED=true`) — Redis worker picks up the task.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

import asyncpg
from fastapi import BackgroundTasks

from app.config import settings
from app.core.celery_app import celery_app
from app.services.auditor import run_audit

log = logging.getLogger(__name__)


def enqueue_audit(
    audit_id: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Kick off compliance analysis for `audit_id`."""
    if settings.celery_enabled:
        try:
            process_audit.delay(audit_id)
            return
        except Exception as exc:  # pragma: no cover - broker-down path
            log.warning(
                "Celery broker unreachable (%s); running audit inline "
                "for audit %s. Set CELERY_ENABLED=false to silence this.",
                exc,
                audit_id,
            )

    _run_inline(audit_id, background_tasks)


def _run_inline(
    audit_id: str,
    background_tasks: BackgroundTasks | None,
) -> None:
    if background_tasks is not None:
        background_tasks.add_task(_run_pipeline_sync, audit_id)
        return

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is not None:
        loop.create_task(run_audit_pipeline(uuid.UUID(audit_id)))
    else:
        asyncio.run(run_audit_pipeline(uuid.UUID(audit_id)))


def _run_pipeline_sync(audit_id: str) -> None:
    try:
        asyncio.run(run_audit_pipeline(uuid.UUID(audit_id)))
    except Exception:
        log.exception("Inline audit failed for audit %s", audit_id)


@celery_app.task(name="audit.process_audit", bind=True, max_retries=2)
def process_audit(self, audit_id: str) -> dict:  # type: ignore[no-untyped-def]
    try:
        return asyncio.run(run_audit_pipeline(uuid.UUID(audit_id)))
    except Exception as exc:  # pragma: no cover - retry path
        raise self.retry(
            exc=exc,
            countdown=min(60 * (self.request.retries + 1), 300),
        )


async def run_audit_pipeline(audit_id: uuid.UUID) -> dict:
    """Mark PROCESSING, run the auditor, then READY or FAILED."""
    conn = await asyncpg.connect(dsn=str(settings.database_url))
    try:
        row = await conn.fetchrow(
            'SELECT "id" FROM "ComplianceAudit" WHERE "id" = $1',
            audit_id,
        )
        if row is None:
            return {"audit_id": str(audit_id), "status": "missing"}

        await conn.execute(
            """
            UPDATE "ComplianceAudit"
            SET "status" = 'PROCESSING'::"AuditStatus",
                "errorMessage" = NULL
            WHERE "id" = $1
            """,
            audit_id,
        )

        try:
            finding_count = await run_audit(conn, audit_id=audit_id)
            log.info(
                "Audit complete for %s: %d findings",
                audit_id,
                finding_count,
            )
            return {
                "audit_id": str(audit_id),
                "status": "READY",
                "findings": finding_count,
            }
        except Exception as exc:
            message = str(exc)[:2000] or exc.__class__.__name__
            await conn.execute(
                """
                UPDATE "ComplianceAudit"
                SET "status" = 'FAILED'::"AuditStatus",
                    "errorMessage" = $2
                WHERE "id" = $1
                """,
                audit_id,
                message,
            )
            log.exception("Audit failed for %s", audit_id)
            return {
                "audit_id": str(audit_id),
                "status": "FAILED",
                "error": message,
            }
    finally:
        await conn.close()
