-- ---------------------------------------------------------------------------
-- ComplianceAudit lifecycle status (async LLM auditor)
-- ---------------------------------------------------------------------------

CREATE TYPE "AuditStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'READY',
    'FAILED'
);

ALTER TABLE "ComplianceAudit"
    ADD COLUMN "status"       "AuditStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "errorMessage" TEXT;

-- Existing rows (if any) were created before the async pipeline existed and
-- have no findings generation pending — treat them as complete.
UPDATE "ComplianceAudit" SET "status" = 'READY'::"AuditStatus";
