-- ============================================================================
-- raid-docs :: initial schema
-- Raw PostgreSQL DDL. Applied by `python -m scripts.migrate`.
-- Table/column names use quoted PascalCase / camelCase so the DB stays
-- compatible with the Prisma reference schema.
-- ============================================================================

-- pgcrypto gives us gen_random_uuid() for default UUIDs.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Optional: uncomment if you plan to store embeddings in Postgres via pgvector.
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE "Role"         AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE "DocStatus"    AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- ---------------------------------------------------------------------------
-- Organization
-- ---------------------------------------------------------------------------
CREATE TABLE "Organization" (
    "id"        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    "name"      TEXT        NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- User
-- ---------------------------------------------------------------------------
CREATE TABLE "User" (
    "id"             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    "email"          TEXT        NOT NULL UNIQUE,
    "role"           "Role"      NOT NULL DEFAULT 'MEMBER',
    "organizationId" UUID        NOT NULL,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "User_organizationId_fkey"
        FOREIGN KEY ("organizationId")
        REFERENCES "Organization" ("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- ---------------------------------------------------------------------------
-- Document
-- ---------------------------------------------------------------------------
CREATE TABLE "Document" (
    "id"             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    "title"          TEXT         NOT NULL,
    "fileUrl"        TEXT         NOT NULL,
    "fileSize"       INTEGER      NOT NULL,
    "mimeType"       TEXT         NOT NULL,
    "status"         "DocStatus"  NOT NULL DEFAULT 'PENDING',
    "pageCount"      INTEGER,
    "organizationId" UUID         NOT NULL,
    "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT "Document_organizationId_fkey"
        FOREIGN KEY ("organizationId")
        REFERENCES "Organization" ("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX "Document_organizationId_idx" ON "Document" ("organizationId");

-- ---------------------------------------------------------------------------
-- DocumentChunk
-- ---------------------------------------------------------------------------
CREATE TABLE "DocumentChunk" (
    "id"         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    "documentId" UUID        NOT NULL,
    "content"    TEXT        NOT NULL,
    "pageNumber" INTEGER     NOT NULL,
    "chunkIndex" INTEGER     NOT NULL,
    -- Vector ID pointing to Pinecone (or FK if you swap to pgvector).
    "vectorId"   TEXT        NOT NULL UNIQUE,
    "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "DocumentChunk_documentId_fkey"
        FOREIGN KEY ("documentId")
        REFERENCES "Document" ("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX "DocumentChunk_documentId_idx" ON "DocumentChunk" ("documentId");

-- ---------------------------------------------------------------------------
-- ComplianceAudit
-- ---------------------------------------------------------------------------
CREATE TABLE "ComplianceAudit" (
    "id"             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    "documentId"     UUID        NOT NULL,
    "organizationId" UUID        NOT NULL,
    -- e.g. 'GDPR', 'SOC2', 'HIPAA'
    "framework"      TEXT        NOT NULL,
    "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "ComplianceAudit_documentId_fkey"
        FOREIGN KEY ("documentId")
        REFERENCES "Document" ("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT "ComplianceAudit_organizationId_fkey"
        FOREIGN KEY ("organizationId")
        REFERENCES "Organization" ("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX "ComplianceAudit_documentId_idx"     ON "ComplianceAudit" ("documentId");
CREATE INDEX "ComplianceAudit_organizationId_idx" ON "ComplianceAudit" ("organizationId");

-- ---------------------------------------------------------------------------
-- AuditFinding
-- ---------------------------------------------------------------------------
CREATE TABLE "AuditFinding" (
    "id"               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    "auditId"          UUID           NOT NULL,
    "severity"         "RiskSeverity" NOT NULL,
    -- The identified policy/text clause.
    "clause"           TEXT           NOT NULL,
    "issueDescription" TEXT           NOT NULL,
    "remediation"      TEXT           NOT NULL,
    CONSTRAINT "AuditFinding_auditId_fkey"
        FOREIGN KEY ("auditId")
        REFERENCES "ComplianceAudit" ("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX "AuditFinding_auditId_idx" ON "AuditFinding" ("auditId");

-- ---------------------------------------------------------------------------
-- updatedAt auto-touch trigger
-- Without an ORM to bump @updatedAt from the client, let the DB do it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Organization_set_updated_at"
    BEFORE UPDATE ON "Organization"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER "Document_set_updated_at"
    BEFORE UPDATE ON "Document"
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
