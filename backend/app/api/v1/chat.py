"""RAG chat endpoints — synchronous JSON answers and SSE streaming."""

from __future__ import annotations

import json
from typing import AsyncIterator

import asyncpg
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.database import get_connection
from app.core.security import CurrentUser, get_current_user
from app.schemas.chat import ChatQuery, ChatResponse
from app.services.rag import RAGService

router = APIRouter()


@router.post("/query", response_model=ChatResponse)
async def query(
    payload: ChatQuery,
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> ChatResponse:
    """Return a single, fully-formed RAG answer."""
    rag = RAGService(conn=conn, organization_id=user.organization_id)
    return await rag.answer(payload)


@router.post("/stream")
async def stream(
    payload: ChatQuery,
    conn: asyncpg.Connection = Depends(get_connection),
    user: CurrentUser = Depends(get_current_user),
) -> StreamingResponse:
    """Stream tokens back to the client as Server-Sent Events."""
    rag = RAGService(conn=conn, organization_id=user.organization_id)

    async def event_source() -> AsyncIterator[bytes]:
        async for event in rag.stream(payload):
            yield f"data: {json.dumps(event)}\n\n".encode("utf-8")
        yield b"event: done\ndata: {}\n\n"

    return StreamingResponse(event_source(), media_type="text/event-stream")
