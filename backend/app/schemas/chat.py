"""Pydantic schemas for RAG chat endpoints."""

from __future__ import annotations

import uuid
from typing import List

from pydantic import BaseModel, Field


class ChatQuery(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    document_ids: List[uuid.UUID] | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)


class Citation(BaseModel):
    document_id: uuid.UUID
    chunk_id: uuid.UUID
    score: float
    snippet: str
    document_title: str | None = None


class ChatResponse(BaseModel):
    answer: str
    citations: List[Citation] = Field(default_factory=list)
