BEGIN;
CREATE TYPE "NewsIngestionMethod" AS ENUM ('RSS','ATOM','HTML_INDEX','OFFICIAL_PAGE','API','MANUAL');
ALTER TABLE "NewsSource"
  ADD COLUMN slug TEXT,
  ADD COLUMN language TEXT,
  ADD COLUMN country TEXT,
  ADD COLUMN official BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "termsReviewed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ingestionAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "permissionReference" TEXT,
  ADD COLUMN "maxExcerptChars" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ingestionMethod" "NewsIngestionMethod" NOT NULL DEFAULT 'MANUAL';
CREATE UNIQUE INDEX "NewsSource_slug_key" ON "NewsSource"(slug);
ALTER TABLE "NewsSource" ADD CONSTRAINT "NewsSource_excerpt_limit" CHECK ("maxExcerptChars" BETWEEN 0 AND 280);
ALTER TABLE "NewsSource" ADD CONSTRAINT "NewsSource_permission" CHECK (NOT "ingestionAllowed" OR
  ("termsReviewed" AND "reviewedAt" IS NOT NULL AND length(btrim(reviewer)) > 0 AND reviewer IS NOT NULL
   AND "permissionReference" IS NOT NULL AND length(btrim("permissionReference")) > 0));
ALTER TABLE "Article" ALTER COLUMN "publishedAt" DROP NOT NULL;
ALTER TABLE "Article" ADD CONSTRAINT "Article_publication_date" CHECK ("publicationStatus" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);
CREATE TABLE "ArticleUrl" (
  url TEXT PRIMARY KEY,
  "articleId" UUID NOT NULL REFERENCES "Article"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);
CREATE INDEX "ArticleUrl_articleId_idx" ON "ArticleUrl"("articleId");
-- No merges/deletes: legacy cross-column collisions require explicit editorial resolution.
INSERT INTO "ArticleUrl" (url,"articleId")
  SELECT "sourceUrl",id FROM "Article" UNION SELECT "canonicalUrl",id FROM "Article";
COMMIT;
