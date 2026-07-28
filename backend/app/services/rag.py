"""RAG orchestration: vector retrieval + LLM prompting.

Two product surfaces share retrieval:

- **Chat** (`answer` / `stream`) — conversational Q&A with chunk citations.
- **Search** (`search`) — AI insight + related documents for the search bar.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import AsyncIterator, Dict, List, Sequence

import asyncpg
import httpx

from app.config import settings
from app.schemas.chat import ChatQuery, ChatResponse, Citation
from app.schemas.search import SearchDocumentHit, SearchQuery, SearchResponse
from app.services.embeddings import embed_query

_SYSTEM_PROMPT = """You are RAID Docs, an enterprise document intelligence assistant.

TASK:
Answer the user's question directly using ONLY the background information provided.

STRICT WRITING RULES:
1. DIRECT SYNTHESIS: Write as if you read the original document directly. NEVER mention "blocks", "chunks", "excerpts", "documents provided", or "context".
2. ABSOLUTE TRUTH: Include only facts explicitly stated in the background text. Do not infer, fabricate, or extrapolate.
3. UNSUPPORTED QUESTIONS: If the background text does not contain enough detail to answer the query, respond ONLY with:
"I cannot answer this question based on the indexed documents."

FORMATTING:
- Begin immediately with the direct answer in 1-2 paragraphs or clean bullet points.
- Omit all conversational greetings, intros, and follow-up questions.
"""

_SEARCH_INSIGHT_PROMPT = """Role: You are RAID Docs, an enterprise AI search analyst.

Task: Synthesize a direct, concise insight (100–200 words max) that directly answers the user's query based strictly on the provided document excerpts.

Core Guidelines:
1. Direct Start: Begin immediately with the core finding or answer. NEVER start with meta-phrases such as "Based on the search results for...", "According to the documents...", or "There are two matching documents...".
2. Fact-Based Grounding: State only facts explicitly supported by the context. Do not invent details, speculate, or extrapolate.
3. Relevance Filtering: Discard weak, duplicate, or irrelevant excerpts. Focus only on high-confidence matches.
4. Professional Tone: Maintain a direct, analytical, and objective tone. Do not use conversational filler, greetings, or follow-up questions.

Formatting Rules:
- Paragraph 1: A 1–2 sentence executive summary directly answering the query.
- Paragraph 2 / Bullet Points (Optional): 2–3 concise bullet points highlighting key details or source documents if multiple relevant facts exist.

Fallback Rule:
If the excerpts are empty, irrelevant, or too weak to answer the query, respond ONLY with: No relevant information found in the indexed documents for this query.
"""


@dataclass(frozen=True)
class _RetrievedChunk:
    id: uuid.UUID
    document_id: uuid.UUID
    content: str
    score: float
    document_title: str | None = None
    status: str | None = None
    mime_type: str | None = None
    updated_at: datetime | None = None


class RAGService:
    def __init__(
        self,
        *,
        conn: asyncpg.Connection,
        organization_id: uuid.UUID,
    ) -> None:
        self.conn = conn
        self.organization_id = organization_id

    async def answer(self, query: ChatQuery) -> ChatResponse:
        chunks = await self._retrieve(
            question=query.question,
            document_ids=list(query.document_ids) if query.document_ids else None,
            top_k=query.top_k,
        )
        prompt = self._build_prompt(query.question, chunks)
        text = await self._generate(prompt)
        return ChatResponse(answer=text, citations=self._to_citations(chunks))

    async def search(self, query: SearchQuery) -> SearchResponse:
        # Prefer more hits for the document search-engine surface.
        top_k = query.top_k or max(settings.rag_top_k, 15)
        chunks = await self._retrieve(
            question=query.question,
            document_ids=list(query.document_ids) if query.document_ids else None,
            top_k=top_k,
        )
        documents = self._group_documents(chunks)
        title_hits = await self._find_documents_by_title(
            query.question, limit=top_k
        )
        documents = self._merge_document_hits(documents, title_hits)[:top_k]

        if not documents:
            return SearchResponse(
                insight="No matching documents found for that query in your workspace.",
                documents=[],
                query=query.question,
            )

        prompt = self._build_search_insight_prompt(query.question, documents)
        insight = await self._generate(prompt)
        return SearchResponse(
            insight=insight
            or "Matching documents were found; open a result to review the source.",
            documents=documents,
            query=query.question,
        )

    async def stream(self, query: ChatQuery) -> AsyncIterator[Dict]:
        chunks = await self._retrieve(
            question=query.question,
            document_ids=list(query.document_ids) if query.document_ids else None,
            top_k=query.top_k,
        )
        yield {
            "type": "citations",
            "citations": [
                c.model_dump(mode="json") for c in self._to_citations(chunks)
            ],
        }

        prompt = self._build_prompt(query.question, chunks)
        async for token in self._stream_tokens(prompt):
            yield {"type": "token", "content": token}

    async def _retrieve(
        self,
        *,
        question: str,
        document_ids: List[uuid.UUID] | None = None,
        top_k: int | None = None,
    ) -> List[_RetrievedChunk]:
        limit = top_k or settings.rag_top_k
        # Fetch extra chunks so grouping by document still yields several docs.
        fetch_limit = max(limit * 3, 15)
        query_vec = await embed_query(question)

        rows = await self.conn.fetch(
            """
            SELECT 
                c."id",
                c."documentId",
                c."content",
                d."title" AS "documentTitle",
                d."status",
                d."mimeType",
                d."updatedAt",
                
                -- Weighted Hybrid Score (Vector + Title Boost + Content Boost)
                (
                    -- 1. Base Vector Similarity (0.0 to 1.0) weighted at 60%
                    (1 - (c."embedding" <=> $1::vector)) * 0.60
                    
                    -- 2. Title Exact/Partial Match Boost (Adds 0.30 if filename matches search)
                    + CASE 
                        WHEN $4::text IS NOT NULL AND $4 <> '' AND (
                            d."title" ILIKE '%' || $4 || '%'
                            OR REPLACE(REPLACE(d."title", '_', ' '), '-', ' ') ILIKE '%' || REPLACE(REPLACE($4, '_', ' '), '-', ' ') || '%'
                        ) THEN 0.30 
                        ELSE 0.00 
                    END
                    
                    -- 3. Content Match Boost (Adds 0.10 if keyword exists in chunk)
                    + CASE 
                        WHEN $4::text IS NOT NULL AND $4 <> '' AND c."content" ILIKE '%' || $4 || '%' 
                        THEN 0.10 
                        ELSE 0.00 
                    END
                ) AS score

            FROM "DocumentChunk" c
            JOIN "Document" d ON d."id" = c."documentId"
            WHERE 
                -- 1. Tenant Isolation & Valid Embeddings
                d."organizationId" = $2 
                AND c."embedding" IS NOT NULL
                
                -- 2. Document Scope Filter
                AND ($3::uuid[] IS NULL OR c."documentId" = ANY($3::uuid[]))
                
                -- 3. Search Matching
                AND (
                    (1 - (c."embedding" <=> $1::vector)) > $5
                    OR ($4::text IS NOT NULL AND $4 <> '' AND (
                        d."title" ILIKE '%' || $4 || '%'
                        OR REPLACE(REPLACE(d."title", '_', ' '), '-', ' ') ILIKE '%' || REPLACE(REPLACE($4, '_', ' '), '-', ' ') || '%'
                        OR c."content" ILIKE '%' || $4 || '%'
                    ))
                )

            -- CRITICAL FIX: Order by calculated score DESC instead of raw vector distance
            ORDER BY score DESC
            LIMIT $6;
            """,
            query_vec,
            self.organization_id,
            document_ids,
            question,
            0.5,
            fetch_limit,
        )

        return [
            _RetrievedChunk(
                id=r["id"],
                document_id=r["documentId"],
                content=r["content"],
                score=float(r["score"]),
                document_title=r["documentTitle"],
                status=r["status"],
                mime_type=r["mimeType"],
                updated_at=r["updatedAt"],
            )
            for r in rows
        ]

    def _group_documents(
        self, chunks: Sequence[_RetrievedChunk]
    ) -> List[SearchDocumentHit]:
        """Collapse chunks to one hit per document (best score + snippet)."""
        best: dict[uuid.UUID, SearchDocumentHit] = {}
        for chunk in chunks:
            existing = best.get(chunk.document_id)
            if existing is None or chunk.score > existing.score:
                best[chunk.document_id] = SearchDocumentHit(
                    id=chunk.document_id,
                    title=chunk.document_title or "Untitled document",
                    score=min(chunk.score, 1.0),
                    snippet=chunk.content[:320],
                    status=chunk.status,
                    mime_type=chunk.mime_type,
                    updated_at=chunk.updated_at,
                )
        return sorted(best.values(), key=lambda d: d.score, reverse=True)

    async def _find_documents_by_title(
        self, query: str, *, limit: int
    ) -> List[SearchDocumentHit]:
        """Filename / title search so the page works as a document finder."""
        q = query.strip()
        if not q:
            return []

        rows = await self.conn.fetch(
            """
            SELECT
                d."id",
                d."title",
                d."status",
                d."mimeType",
                d."updatedAt",
                COALESCE(
                    (
                        SELECT c."content"
                        FROM "DocumentChunk" c
                        WHERE c."documentId" = d."id"
                        ORDER BY c."chunkIndex" ASC
                        LIMIT 1
                    ),
                    ''
                ) AS snippet,
                CASE
                    WHEN lower(d."title") = lower($2) THEN 1.0
                    WHEN d."title" ILIKE $2 || '%' THEN 0.92
                    WHEN d."title" ILIKE '%' || $2 || '%' THEN 0.85
                    WHEN REPLACE(REPLACE(d."title", '_', ' '), '-', ' ')
                         ILIKE '%' || REPLACE(REPLACE($2, '_', ' '), '-', ' ') || '%'
                        THEN 0.8
                    ELSE 0.7
                END AS score
            FROM "Document" d
            WHERE
                d."organizationId" = $1
                AND (
                    d."title" ILIKE '%' || $2 || '%'
                    OR REPLACE(REPLACE(d."title", '_', ' '), '-', ' ')
                       ILIKE '%' || REPLACE(REPLACE($2, '_', ' '), '-', ' ') || '%'
                )
            ORDER BY score DESC, d."updatedAt" DESC
            LIMIT $3
            """,
            self.organization_id,
            q,
            limit,
        )

        return [
            SearchDocumentHit(
                id=r["id"],
                title=r["title"] or "Untitled document",
                score=float(r["score"]),
                snippet=(r["snippet"] or "Title match — open the document to view contents.")[
                    :320
                ],
                status=r["status"],
                mime_type=r["mimeType"],
                updated_at=r["updatedAt"],
            )
            for r in rows
        ]

    def _merge_document_hits(
        self,
        primary: Sequence[SearchDocumentHit],
        secondary: Sequence[SearchDocumentHit],
    ) -> List[SearchDocumentHit]:
        """Union hits by document id, keeping the higher score and richest metadata."""
        merged: dict[uuid.UUID, SearchDocumentHit] = {}
        for hit in [*primary, *secondary]:
            existing = merged.get(hit.id)
            if existing is None:
                merged[hit.id] = hit
                continue
            merged[hit.id] = SearchDocumentHit(
                id=hit.id,
                title=hit.title or existing.title,
                score=max(existing.score, hit.score),
                snippet=existing.snippet if len(existing.snippet) >= len(hit.snippet) else hit.snippet,
                status=hit.status or existing.status,
                mime_type=hit.mime_type or existing.mime_type,
                updated_at=hit.updated_at or existing.updated_at,
            )
        return sorted(merged.values(), key=lambda d: d.score, reverse=True)

    def _build_search_insight_prompt(
        self, question: str, documents: Sequence[SearchDocumentHit]
    ) -> str:
        blocks = [
            f"[{i + 1}] {doc.title}\n{doc.snippet}"
            for i, doc in enumerate(documents[:8])
        ]
        context = "\n\n".join(blocks)
        return (
            f"{_SEARCH_INSIGHT_PROMPT}\n\n"
            f"Search query: {question}\n\n"
            f"Matching excerpts:\n{context}\n\n"
            "Insight:"
        )

    def _build_prompt(
        self, question: str, chunks: Sequence[_RetrievedChunk]
    ) -> str:
        context_blocks = [
            f"[{i + 1}] {chunk.document_title}: {chunk.content}" for i, chunk in enumerate(chunks)
        ]
        context = "\n\n".join(context_blocks) or "(no relevant context found)"
        return (
            f"{_SYSTEM_PROMPT}\n\n"
            f"Context:\n{context}\n\n"
            f"Question: {question}\n\n"
            "Answer:"
        )

    def _to_citations(
        self, chunks: Sequence[_RetrievedChunk]
    ) -> List[Citation]:
        return [
            Citation(
                document_id=chunk.document_id,
                chunk_id=chunk.id,
                score=chunk.score,
                snippet=chunk.content[:280],
                document_title=chunk.document_title,
            )
            for chunk in chunks
        ]

    async def _generate(self, prompt: str) -> str:
        url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                url,
                json={
                    "model": settings.llm_model,
                    "prompt": prompt,
                    "stream": False,
                },
            )
            response.raise_for_status()
            return response.json().get("response", "").strip()

    async def _stream_tokens(self, prompt: str) -> AsyncIterator[str]:
        url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                url,
                json={
                    "model": settings.llm_model,
                    "prompt": prompt,
                    "stream": True,
                },
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        payload = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if chunk := payload.get("response"):
                        yield chunk
                    if payload.get("done"):
                        break
