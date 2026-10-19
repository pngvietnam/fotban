BEGIN;
ALTER TABLE "ArticleCluster"
  ADD COLUMN "manualOverrideAt" TIMESTAMPTZ(3),
  ADD COLUMN "manualDisputed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN featured BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "ArticleClusterRevision" (
  id UUID NOT NULL,
  "clusterId" UUID NOT NULL,
  revision INTEGER NOT NULL,
  "inputHash" TEXT NOT NULL,
  "algorithmVersion" TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleClusterRevision_pkey" PRIMARY KEY (id),
  CONSTRAINT "ArticleClusterRevision_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "ArticleCluster"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ArticleClusterRevision_positive" CHECK (revision>0),
  CONSTRAINT "ArticleClusterRevision_snapshot_object" CHECK (jsonb_typeof(snapshot)='object')
);
CREATE UNIQUE INDEX "ArticleClusterRevision_clusterId_revision_key" ON "ArticleClusterRevision"("clusterId",revision);
-- Repeating the current state is a no-op, but an undo may restore an older hash as a new revision.
CREATE INDEX "ArticleClusterRevision_clusterId_inputHash_idx" ON "ArticleClusterRevision"("clusterId","inputHash");
COMMIT;
