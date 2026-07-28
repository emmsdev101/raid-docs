"""Text chunking utilities.

A deliberately simple, dependency-free recursive splitter tuned for the
default `chunk_size` / `chunk_overlap` in `app.config`. Swap for
`langchain_text_splitters` if we outgrow it.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List

from app.config import settings

_SEPARATORS: tuple[str, ...] = ("\n\n", "\n", ". ", " ", "")


@dataclass(frozen=True)
class Chunk:
    index: int
    text: str


def chunk_text(
    text: str,
    *,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> List[Chunk]:
    """Split `text` into overlapping chunks suitable for embedding."""
    size = chunk_size or settings.chunk_size
    overlap = chunk_overlap or settings.chunk_overlap
    if overlap >= size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    text = text.strip()
    if not text:
        return []

    raw_chunks = list(_split(text, size, _SEPARATORS))
    merged = _merge_with_overlap(raw_chunks, size, overlap)
    return [Chunk(index=i, text=c) for i, c in enumerate(merged) if c.strip()]


def _split(text: str, size: int, separators: tuple[str, ...]) -> Iterable[str]:
    if len(text) <= size or not separators:
        yield text
        return

    sep, *rest = separators
    if sep == "":
        for i in range(0, len(text), size):
            yield text[i : i + size]
        return

    parts = text.split(sep)
    buffer = ""
    for part in parts:
        candidate = f"{buffer}{sep}{part}" if buffer else part
        if len(candidate) <= size:
            buffer = candidate
            continue
        if buffer:
            yield buffer
        if len(part) > size:
            yield from _split(part, size, tuple(rest))
            buffer = ""
        else:
            buffer = part
    if buffer:
        yield buffer


def _merge_with_overlap(chunks: List[str], size: int, overlap: int) -> List[str]:
    merged: List[str] = []
    for chunk in chunks:
        if not merged:
            merged.append(chunk)
            continue
        tail = merged[-1][-overlap:] if overlap else ""
        combined = f"{tail}{chunk}" if tail and not chunk.startswith(tail) else chunk
        merged.append(combined[:size])
    return merged
