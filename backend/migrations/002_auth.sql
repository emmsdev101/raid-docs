-- ============================================================================
-- raid-docs :: auth hardening
--   * Organization gets a canonical email-domain column (e.g. "acme.com")
--     so registration can auto-assign users to the right workspace.
--   * User gets a passwordHash + optional display name so the API can own
--     credentials directly (no external IdP required for local dev).
-- ============================================================================

ALTER TABLE "Organization"
    ADD COLUMN IF NOT EXISTS "domain" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_domain_key"
    ON "Organization" (LOWER("domain"))
    WHERE "domain" IS NOT NULL;

ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "name"         TEXT,
    ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

-- Store emails case-insensitively so login/register can't be duped by
-- capitalisation. Existing rows are normalised in-place first.
UPDATE "User" SET "email" = LOWER("email") WHERE "email" <> LOWER("email");

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_key"
    ON "User" (LOWER("email"));
