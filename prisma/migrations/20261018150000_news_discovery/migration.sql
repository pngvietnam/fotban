-- Add provenance without changing any source permission or publication gate.
CREATE TABLE "ArticleDiscovery" (
  id uuid PRIMARY KEY,
  "articleId" uuid NOT NULL REFERENCES "Article"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  provider text NOT NULL CHECK (provider = 'GDELT_DOC'),
  url text NOT NULL,
  domain text NOT NULL,
  "sourceCountry" text,
  "seenAt" timestamptz(3) NOT NULL,
  "collectedAt" timestamptz(3) NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL,
  CONSTRAINT "ArticleDiscovery_provider_url_key" UNIQUE(provider,url)
);
CREATE INDEX "ArticleDiscovery_articleId_idx" ON "ArticleDiscovery"("articleId");
CREATE INDEX "ArticleDiscovery_provider_collectedAt_idx" ON "ArticleDiscovery"(provider,"collectedAt");
