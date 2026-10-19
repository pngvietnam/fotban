-- Additive only. Free-licence player photos found on Wikimedia Commons; no existing row is changed.

-- CreateTable
CREATE TABLE "PlayerImage" (
    "playerId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "wikidataId" TEXT,
    "fileName" TEXT,
    "thumbUrl" TEXT,
    "descriptionUrl" TEXT,
    "author" TEXT,
    "licenseName" TEXT,
    "licenseUrl" TEXT,
    "checkedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlayerImage_pkey" PRIMARY KEY ("playerId")
);

-- CreateIndex
CREATE INDEX "PlayerImage_status_checkedAt_idx" ON "PlayerImage"("status", "checkedAt");

-- AddForeignKey
ALTER TABLE "PlayerImage" ADD CONSTRAINT "PlayerImage_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A photo is usable only with complete credit: the file page, author and licence, a Wikimedia-hosted
-- thumbnail and a free licence name (no non-commercial or no-derivatives terms).
ALTER TABLE "PlayerImage" ADD CONSTRAINT "PlayerImage_status" CHECK ("status" IN ('FOUND', 'NOT_FOUND'));
ALTER TABLE "PlayerImage" ADD CONSTRAINT "PlayerImage_found_credit" CHECK (
  "status" <> 'FOUND' OR (
    "wikidataId" IS NOT NULL AND "fileName" IS NOT NULL AND "author" IS NOT NULL AND btrim("author") <> ''
    AND "licenseName" IS NOT NULL AND "licenseName" !~* '(^|[ -])(NC|ND)([ -]|$)'
    AND "descriptionUrl" ~ '^https://commons\.wikimedia\.org/'
    AND "thumbUrl" ~ '^https://(upload|thumb)\.wikimedia\.org/wikipedia/commons/'));
