-- Additive only. Publisher feed images are hotlinked by readers; only the address is stored, never the file.
-- Images stay off for every source until the owner's per-source switch is turned on.
ALTER TABLE "ArticleFeedSnapshot" ADD COLUMN     "imageUrl" TEXT;
ALTER TABLE "NewsSource" ADD COLUMN     "imagesAllowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ArticleFeedSnapshot" ADD CONSTRAINT "ArticleFeedSnapshot_image_https" CHECK ("imageUrl" IS NULL OR "imageUrl" ~ '^https://[^/@:]+/');
