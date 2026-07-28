"""Pydantic schemas for document semantic-search endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List

from pydantic import BaseModel, Field


class SearchQuery(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    document_ids: List[uuid.UUID] | None = None
    top_k: int | None = Field(default=None, ge=1, le=50)


class SearchDocumentHit(BaseModel):
    """One document in search-engine results."""

    id: uuid.UUID
    title: str
    score: float
    snippet: str
    status: str | None = None
    mime_type: str | None = None
    updated_at: datetime | None = None


class SearchResponse(BaseModel):
    """AI insight plus ranked document hits for workspace search."""

    insight: str
    documents: List[SearchDocumentHit] = Field(default_factory=list)
    query: str
