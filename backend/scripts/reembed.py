"""Backfill pgvector embeddings for DocumentChunk rows that lack them.

Run after applying `migrations/003_pgvector.sql` so previously ingested
chunks become searchable without re-uploading documents.

Usage (from the `backend/` directory, venv active, Ollama running):

    python -m scripts.reembed
    python -m scripts.reembed --dry-run
    python -m scripts.reembed --batch-size 16
"""

from __future__ import annotations

import argparse
import asyncio
import sys

import asyncpg
from pgvector.asyncpg import register_vector

from app.config import settings
from app.services.embeddings import EmbeddingError, embed_texts


async def _run(*, dry_run: bool, batch_size: int) -> int:
    conn = await asyncpg.connect(dsn=str(settings.database_url))
    try:
        await register_vector(conn)

        total = await conn.fetchval(
            'SELECT COUNT(*) FROM "DocumentChunk" WHERE "embedding" IS NULL'
        )
        print(f"[reembed] chunks needing embeddings: {total}")
        if dry_run or total == 0:
            return 0

        updated = 0
        while True:
            rows = await conn.fetch(
                """
                SELECT "id", "content"
                FROM "DocumentChunk"
                WHERE "embedding" IS NULL
                ORDER BY "createdAt" ASC
                LIMIT $1
                """,
                batch_size,
            )
            if not rows:
                break

            texts = [r["content"] for r in rows]
            try:
                vectors = await embed_texts(texts)
            except EmbeddingError as exc:
                print(f"[reembed] FAIL: {exc}", file=sys.stderr)
                return 1

            async with conn.transaction():
                for row, vector in zip(rows, vectors, strict=True):
                    await conn.execute(
                        """
                        UPDATE "DocumentChunk"
                        SET "embedding" = $1
                        WHERE "id" = $2
                        """,
                        vector,
                        row["id"],
                    )

            updated += len(rows)
            print(f"[reembed] updated {updated}/{total}")

        print(f"[reembed] done — {updated} chunk(s) embedded")
        return 0
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Backfill DocumentChunk embeddings via Ollama."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count rows that need embeddings without writing anything.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=32,
        help="Number of chunks to embed per Ollama round-trip (default: 32).",
    )
    args = parser.parse_args()
    if args.batch_size < 1:
        print("[reembed] --batch-size must be >= 1", file=sys.stderr)
        return 2

    return asyncio.run(_run(dry_run=args.dry_run, batch_size=args.batch_size))


if __name__ == "__main__":
    raise SystemExit(main())
