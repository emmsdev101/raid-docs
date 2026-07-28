"""Pydantic request/response schemas for document endpoints."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from pydantic import BaseModel


class DocStatus(str, enum.Enum):
    """Matches the Postgres `DocStatus` enum from `migrations/001_initial.sql`."""

    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class DocumentOut(BaseModel):
    id: uuid.UUID
    title: str
    file_url: str
    file_size: int
    mime_type: str
    status: DocStatus
    page_count: int | None = None
    chunk_count: int = 0
    created_at: datetime
    updated_at: datetime


class DocumentStatusOut(BaseModel):
    id: uuid.UUID
    status: DocStatus
