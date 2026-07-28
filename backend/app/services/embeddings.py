"""Embedding generation via a local Ollama server."""

from __future__ import annotations

from typing import List, Sequence

import httpx

from app.config import settings


class EmbeddingError(RuntimeError):
    """Raised when the embedding backend returns an unexpected response."""


_OLLAMA_HINT = (
    "Is Ollama running on {base}? "
    "Have you pulled the embedding model "
    "(`ollama pull {model}`)? "
    "Start the server with `ollama serve` if needed."
)


def _ollama_hint() -> str:
    return _OLLAMA_HINT.format(
        base=settings.ollama_base_url,
        model=settings.embedding_model,
    )


async def embed_texts(texts: Sequence[str]) -> List[List[float]]:
    """Embed a batch of strings, returning one vector per input."""
    if not texts:
        return []

    url = f"{settings.ollama_base_url.rstrip('/')}/api/embeddings"
    vectors: List[List[float]] = []

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            for text in texts:
                response = await client.post(
                    url,
                    json={"model": settings.embedding_model, "prompt": text},
                )
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    raise EmbeddingError(
                        f"Ollama embedding request failed "
                        f"({exc.response.status_code}): {exc.response.text}. "
                        f"{_ollama_hint()}"
                    ) from exc
                payload = response.json()
                vector = payload.get("embedding")
                if not isinstance(vector, list):
                    raise EmbeddingError(
                        f"Missing 'embedding' in Ollama response: {payload!r}. "
                        f"{_ollama_hint()}"
                    )
                if len(vector) != settings.embedding_dim:
                    raise EmbeddingError(
                        f"Expected {settings.embedding_dim}-dim embedding, "
                        f"got {len(vector)}. Check EMBEDDING_MODEL / EMBEDDING_DIM."
                    )
                vectors.append(vector)
    except EmbeddingError:
        raise
    except httpx.ConnectError as exc:
        raise EmbeddingError(
            f"Could not connect to Ollama at {settings.ollama_base_url}. "
            f"{_ollama_hint()}"
        ) from exc
    except httpx.HTTPError as exc:
        raise EmbeddingError(
            f"Ollama embedding request failed: {exc}. {_ollama_hint()}"
        ) from exc

    return vectors


async def embed_query(text: str) -> List[float]:
    """Convenience wrapper for single-query embedding."""
    [vector] = await embed_texts([text])
    return vector
