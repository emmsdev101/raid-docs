-- ============================================================================
-- raid-docs :: pgvector semantic retrieval
--   * Enable the pgvector extension (Aiven Postgres supports this).
--   * Add a 768-dim embedding column to DocumentChunk (matches
--     nomic-embed-text / settings.embedding_dim).
--   * HNSW cosine index for approximate nearest-neighbour search.
-- Existing rows keep embedding = NULL and are excluded from vector
-- search until re-embedded (see scripts/reembed.py).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "vector";

ALTER TABLE "DocumentChunk"
    ADD COLUMN IF NOT EXISTS "embedding" vector(768);

CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_idx"
    ON "DocumentChunk"
    USING hnsw ("embedding" vector_cosine_ops);
