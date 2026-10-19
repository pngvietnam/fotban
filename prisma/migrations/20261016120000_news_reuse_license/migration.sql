BEGIN;
CREATE TYPE "NewsPermissionStatus" AS ENUM ('UNREVIEWED','ALLOWED','RESTRICTED');
ALTER TABLE "NewsSource"
  ADD COLUMN "permissionStatus" "NewsPermissionStatus" NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "commercialReuseAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requiresReusableLicense" BOOLEAN NOT NULL DEFAULT false;
-- Retain previously explicit approvals; this grants no new access.
UPDATE "NewsSource" SET "permissionStatus"='ALLOWED' WHERE "ingestionAllowed" AND "termsReviewed";
ALTER TABLE "Article"
  ADD COLUMN "publishedAtPrecision" TEXT,
  ADD COLUMN "licenseName" TEXT,
  ADD COLUMN "licenseUrl" TEXT,
  ADD COLUMN "attributionText" TEXT,
  ADD COLUMN "licenseEvidenceUrl" TEXT,
  ADD COLUMN "sourceRevisionUrl" TEXT,
  ADD COLUMN "licenseVerifiedAt" TIMESTAMPTZ(3),
  ADD COLUMN "commercialReuseAllowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Article" ADD CONSTRAINT "Article_date_precision" CHECK ("publishedAtPrecision" IN ('DAY','INSTANT'));
ALTER TABLE "Article" ADD CONSTRAINT "Article_reuse_evidence" CHECK (NOT "commercialReuseAllowed" OR
  ("licenseName" IS NOT NULL AND btrim("licenseName")<>'' AND "licenseUrl" IS NOT NULL AND btrim("licenseUrl")<>''
    AND "attributionText" IS NOT NULL AND btrim("attributionText")<>'' AND "licenseEvidenceUrl" IS NOT NULL
    AND "sourceRevisionUrl" IS NOT NULL AND "licenseVerifiedAt" IS NOT NULL));
COMMIT;
