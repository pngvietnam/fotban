-- Stable seed identity survives operator changes to mutable handles/windows.
-- Existing approvals, rights and publication data are preserved.
ALTER TABLE "VideoSource" ADD COLUMN "registryKey" TEXT;
CREATE UNIQUE INDEX "VideoSource_registryKey_key" ON "VideoSource"("registryKey");
UPDATE "VideoSource" SET "registryKey"='vn-initial-premier-league'
  WHERE platform='YOUTUBE' AND "channelHandle"='@FPTBongDaOfficial';
UPDATE "VideoSource" SET "registryKey"='vn-initial-la-liga'
  WHERE platform='YOUTUBE' AND "channelHandle"='@SCTVTheThaoOfficial';
