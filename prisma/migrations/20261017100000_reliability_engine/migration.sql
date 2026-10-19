BEGIN;
CREATE TYPE "SourceTier" AS ENUM ('TIER_0_OFFICIAL','TIER_1_HIGH','TIER_2_ESTABLISHED','TIER_3_UNVERIFIED','COMMUNITY');
CREATE TYPE "EvidenceKind" AS ENUM ('ARTICLE_SOURCE','OFFICIAL_STATEMENT','SECONDARY_SOURCE','SOCIAL_POST','QUOTE','MATCH_DATA','STRUCTURED_PROVIDER');
CREATE TYPE "EvidenceStance" AS ENUM ('SUPPORTS','CONTRADICTS');
-- Conservative defaults: a score or official flag alone grants no editorial authority.
ALTER TABLE "NewsSource" ADD COLUMN "sourceTier" "SourceTier" NOT NULL DEFAULT 'TIER_3_UNVERIFIED',
  ADD COLUMN "authorityScopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ClaimEvidence"
  ADD COLUMN kind "EvidenceKind" NOT NULL DEFAULT 'ARTICLE_SOURCE',
  ADD COLUMN stance "EvidenceStance" NOT NULL DEFAULT 'SUPPORTS',
  ADD COLUMN "claimKey" TEXT,
  ADD COLUMN "lineageKey" TEXT,
  ADD COLUMN "authorityScope" TEXT,
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMPTZ(3),
  ADD COLUMN "supersedesId" UUID;
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "ClaimEvidence"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_review_metadata" CHECK
  (("reviewedAt" IS NULL AND "reviewedBy" IS NULL) OR ("reviewedAt" IS NOT NULL AND "reviewedBy" IS NOT NULL AND btrim("reviewedBy")<>'' AND "claimKey" IS NOT NULL AND btrim("claimKey")<>''));
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_not_self_correction" CHECK ("supersedesId" IS NULL OR "supersedesId"<>id);
CREATE INDEX "ClaimEvidence_supersedesId_idx" ON "ClaimEvidence"("supersedesId");
CREATE TABLE "ReliabilityAssessment" (
  id UUID NOT NULL,
  "articleId" UUID NOT NULL,
  "inputHash" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  result JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReliabilityAssessment_pkey" PRIMARY KEY (id),
  CONSTRAINT "ReliabilityAssessment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReliabilityAssessment_result_object" CHECK (jsonb_typeof(result)='object')
);
CREATE UNIQUE INDEX "ReliabilityAssessment_articleId_inputHash_policyVersion_key" ON "ReliabilityAssessment"("articleId","inputHash","policyVersion");
CREATE INDEX "ReliabilityAssessment_articleId_createdAt_idx" ON "ReliabilityAssessment"("articleId","createdAt");
COMMIT;
