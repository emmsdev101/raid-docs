# RaidDocs AI: Architecture & Database Design Guide

A comprehensive technical architecture document and database schema specification for **RaidDocs AI**—an enterprise knowledge base and automated compliance auditor built using modern Retrieval-Augmented Generation (RAG) and asynchronous background processing.

---

## 1. System Architecture Workflow

The system separates core duties into three major operational layers:
1. **Relational Data Management** (Users, Organizations, Audit Logs, Document Metadata)
2. **Vector Search & Semantic Retrieval** (Embeddings, Hybrid Search)
3. **Asynchronous Processing Pipeline** (Heavy parsing, OCR, chunking, and embedding generation)

```
[ Frontend: Next.js ] 
        │
        ├── 1. Upload Document ────────► [ Backend API: Node / FastAPI ]
        │                                         │
        │                                2. Push Upload Event
        │                                         ▼
        │                              [ BullMQ Queue / Redis ]
        │                                         │
        │                                3. Process Job (Worker)
        │                                         ▼
        │                              ┌───────────────────────────┐
        │                              │ • Extract Text & Metadata │
        │                              │ • Chunk Text (500 tokens) │
        │                              │ • Generate Embeddings     │
        │                              └──────────┬────────────────┘
        │                                         │
        │                        ┌────────────────┴────────────────┐
        │                        ▼                                 ▼
        │              [ PostgreSQL DB ]                [ Vector DB ]
        │         (Doc Metadata & Chunks)             (pgvector or Pinecone)
        │                                                          │
        ├── 4. Hybrid Search Query ────────────────────────────────┘
        │
        └── 5. Stream LLM Response (RAG) ──► [ User Interface ]
```

### The Ingestion Pipeline Workflow
1. **Upload Trigger:** The user uploads a document (PDF, DOCX) through the Next.js frontend. The API creates a `Document` record with status `PROCESSING` and dispatches a job event to Redis (BullMQ).
2. **Chunking Strategy:** A background worker picks up the job, extracts raw text, and splits it into overlapping chunks (~500 tokens with a 50-token overlap to maintain semantic continuity across chunk boundaries).
3. **Dual-Store Persistence:** Embeddings are generated via an API call (e.g., OpenAI `text-embedding-3-small`—1536 dimensions) and pushed to the vector store alongside metadata. Relational attributes (chunk index, page mappings, document references) are stored in PostgreSQL.

---

## 2. PostgreSQL Relational Schema (Prisma ORM)

Below is the complete multi-tenant, role-based schema designed for PostgreSQL using Prisma ORM.

```prisma
// schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum Role {
  ADMIN
  MEMBER
  VIEWER
}

enum DocStatus {
  PENDING
  PROCESSING
  READY
  FAILED
}

enum RiskSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

model Organization {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users     User[]
  documents Document[]
  audits    ComplianceAudit[]
}

model User {
  id             String       @id @default(uuid())
  email          String       @unique
  role           Role         @default(MEMBER)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdAt      DateTime     @default(now())
}

model Document {
  id             String       @id @default(uuid())
  title          String
  fileUrl        String
  fileSize       Int
  mimeType       String
  status         DocStatus    @default(PENDING)
  pageCount      Int?
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  
  chunks         DocumentChunk[]
  audits         ComplianceAudit[]
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([organizationId])
}

model DocumentChunk {
  id          String   @id @default(uuid())
  documentId  String
  document    Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  content     String   @db.Text
  pageNumber  Int
  chunkIndex  Int
  
  // Vector ID pointing to Pinecone OR foreign key if using pgvector
  vectorId    String   @unique 
  createdAt   DateTime @default(now())

  @@index([documentId])
}

model ComplianceAudit {
  id             String        @id @default(uuid())
  documentId     String
  document       Document      @relation(fields: [documentId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  framework      String        // e.g., "GDPR", "SOC2", "HIPAA"
  findings       AuditFinding[]
  createdAt      DateTime      @default(now())
}

model AuditFinding {
  id               String          @id @default(uuid())
  auditId          String
  audit            ComplianceAudit @relation(fields: [auditId], references: [id], onDelete: Cascade)
  severity         RiskSeverity
  clause           String          // The identified policy/text
  issueDescription String          @db.Text
  remediation      String          @db.Text
}
```

---

## 3. Vector Database Implementations

### Option A: Integrated Storage using `pgvector`

Keeping relational data and vectors inside PostgreSQL minimizes operational complexity.

```sql
-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create vector table storing 1536-dimensional embeddings
CREATE TABLE document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID REFERENCES "DocumentChunk"(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL, -- Crucial for tenant isolation!
    embedding vector(1536)
);

-- HNSW Index for fast approximate nearest-neighbor cosine distance search
CREATE INDEX ON document_embeddings 
USING hnsw (embedding vector_cosine_ops);
```

#### Multi-Tenant Vector Search Query
Vectors must always be scoped by `organization_id` to guarantee tenant isolation:

```sql
SELECT 
    c.content, 
    c."pageNumber", 
    1 - (e.embedding <=> $1) AS similarity
FROM document_embeddings e
JOIN "DocumentChunk" c ON c.id = e.chunk_id
WHERE e.organization_id = $2 -- Multi-tenant security filter
ORDER BY e.embedding <=> $1  -- Cosine distance operator
LIMIT 5;
```

---

### Option B: External Managed Store (Pinecone)

When using Pinecone, store essential metadata directly alongside vector values to enable edge filtering prior to distance calculations.

```json
{
  "id": "chunk_9f82a1-b842",
  "values": [0.012, -0.043, 0.211, "... 1536 dimensions"],
  "metadata": {
    "organization_id": "org_12345",
    "document_id": "doc_67890",
    "page_number": 4,
    "chunk_index": 12,
    "text_preview": "Data retention policies require that customer records be kept for..."
  }
}
```

---

## 4. Key Engineering & Security Directives

1. **Strict Multi-Tenant Isolation:** Never execute unbounded vector searches and filter by organization in application code. All vector index queries must enforce `organization_id` filters natively at the DB level.
2. **Idempotent Workers:** Re-uploading or updating a document must wipe existing database chunks and vector records prior to re-indexing to avoid duplicate search hits.
3. **Token Streaming & Citation Tracking:** LLM responses should be delivered via Server-Sent Events (SSE) or WebSockets using Vercel AI SDK, returning text chunks accompanied by source page citations.
