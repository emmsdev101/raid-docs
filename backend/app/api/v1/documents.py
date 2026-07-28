"""Document endpoints: upload, list, retrieve, delete, status, search."""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import List

import asyncpg
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)

from app.config import settings
from app.core.database import get_connection
from app.core.security import CurrentUser, get_current_user
from app.schemas.document import DocStatus, DocumentOut, DocumentStatusOut
from app.schemas.search import SearchQuery, SearchResponse
from app.services.rag import RAGService
from app.tasks.ingestion import enqueue_ingestion

router = APIRouter()


def _row_to_document(row: asyncpg.Record) -> DocumentOut:
    return DocumentOut(
        id=row["id"],
        title=row["title"],
        file_url=row["fileUrl"],
        file_size=row["fileSize"],
        mime_type=row["mimeType"],
        status=DocStatus(row["status"]),
        page_count=row["pageCount"],
        chunk_count=row["chunkCount"] if "chunkCount" in row.keys() else 0,
        created_at=row["createdAt"],
        updated_at=row["updatedAt"],
    )


_DOCUMENT_SELECT = """
SELECT d."id", d."title", d."fileUrl", d."fileSize", d."mimeType",
       d."status", d."pageCount", d."organizationId",
       d."createdAt", d."updatedAt",
       COALESCE(c."chunkCount", 0) AS "chunkCount"
FROM "Document" d
LEFT JOIN (
    SELECT "documentId", COUNT(*)::int AS "chunkCount"
    FROM "DocumentChunk"
    GROUP BY "documentId"
) c ON c."documentId" = d."id"
"""


@router.get("/search", response_model=SearchResponse)
async def search_documents(
    query: str = Query(..., min_length=1, max_length=4000),
    top_k: int | None = Query(default=None, ge=1, le=50),
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> SearchResponse:
    """Document search engine: ranked docs + AI insight for the query."""
    rag = RAGService(conn=conn, organization_id=user.organization_id)
    return await rag.search(SearchQuery(question=query, top_k=top_k))


@router.post(
    "/upload",
    response_model=DocumentOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> DocumentOut:
    """Persist an uploaded file to disk and enqueue background ingestion."""
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    upload_root = Path(settings.upload_dir) / str(user.organization_id)
    upload_root.mkdir(parents=True, exist_ok=True)

    document_id = uuid.uuid4()
    suffix = Path(file.filename or "upload.bin").suffix
    dest = upload_root / f"{document_id}{suffix}"

    size = 0
    with dest.open("wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > max_bytes:
                buffer.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    f"File exceeds {settings.max_upload_size_mb} MB limit",
                )
            buffer.write(chunk)

    row = await conn.fetchrow(
        """
        INSERT INTO "Document" (
            "id", "title", "fileUrl", "fileSize", "mimeType",
            "status", "organizationId"
        )
        VALUES ($1, $2, $3, $4, $5, $6::"DocStatus", $7)
        RETURNING "id", "title", "fileUrl", "fileSize", "mimeType",
                  "status", "pageCount", "organizationId",
                  "createdAt", "updatedAt", 0 AS "chunkCount"
        """,
        document_id,
        file.filename or dest.name,
        str(dest),
        size,
        file.content_type or "application/octet-stream",
        DocStatus.PENDING.value,
        user.organization_id,
    )
    assert row is not None  # RETURNING guarantees one row

    enqueue_ingestion(str(document_id), background_tasks=background_tasks)
    return _row_to_document(row)


@router.get("", response_model=List[DocumentOut])
async def list_documents(
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> List[DocumentOut]:
    rows = await conn.fetch(
        _DOCUMENT_SELECT
        + 'WHERE d."organizationId" = $1 ORDER BY d."createdAt" DESC',
        user.organization_id,
    )
    return [_row_to_document(r) for r in rows]


@router.get("/{document_id}", response_model=DocumentOut)
async def get_document(
    document_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> DocumentOut:
    row = await _fetch_owned(conn, document_id, user)
    return _row_to_document(row)


@router.get("/{document_id}/status", response_model=DocumentStatusOut)
async def get_document_status(
    document_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> DocumentStatusOut:
    row = await _fetch_owned(conn, document_id, user)
    return DocumentStatusOut(id=row["id"], status=DocStatus(row["status"]))


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_document(
    document_id: uuid.UUID,
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> Response:
    row = await _fetch_owned(conn, document_id, user)

    # Best-effort cleanup of on-disk storage — DB row is source of truth.
    path = Path(row["fileUrl"])
    if path.exists():
        try:
            path.unlink()
        except OSError:
            shutil.rmtree(path, ignore_errors=True)

    await conn.execute('DELETE FROM "Document" WHERE "id" = $1', document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


async def _fetch_owned(
    conn: asyncpg.Connection, document_id: uuid.UUID, user: CurrentUser
) -> asyncpg.Record:
    row = await conn.fetchrow(
        _DOCUMENT_SELECT + 'WHERE d."id" = $1 AND d."organizationId" = $2',
        document_id,
        user.organization_id,
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return row
