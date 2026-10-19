-- Additive: legacy Video/source links and all match/news data are retained.
CREATE TABLE "VideoSource" (
 id UUID PRIMARY KEY, platform TEXT NOT NULL DEFAULT 'YOUTUBE', "channelId" TEXT, "channelHandle" TEXT NOT NULL,
 name TEXT NOT NULL, country TEXT NOT NULL, language TEXT NOT NULL, verified BOOLEAN NOT NULL DEFAULT false,
 enabled BOOLEAN NOT NULL DEFAULT false, priority INTEGER NOT NULL DEFAULT 100, "sourceType" TEXT NOT NULL,
 notes TEXT, "lastVerifiedAt" TIMESTAMPTZ(3), "reviewReference" TEXT NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CHECK ("sourceType" IN ('RIGHTS_HOLDER','OFFICIAL_LEAGUE','OFFICIAL_CLUB','BROADCASTER','TRUSTED_MEDIA')),
 CHECK ("channelId" IS NULL OR "channelId" ~ '^UC[A-Za-z0-9_-]{22}$')
);
CREATE UNIQUE INDEX "VideoSource_platform_channelId_key" ON "VideoSource" (platform,"channelId");
CREATE UNIQUE INDEX "VideoSource_platform_channelHandle_key" ON "VideoSource" (platform,"channelHandle");
CREATE TABLE "VideoSourceCompetition" (
 id UUID PRIMARY KEY, "videoSourceId" UUID NOT NULL, "competitionId" UUID NOT NULL, season TEXT NOT NULL,
 market TEXT NOT NULL, language TEXT NOT NULL, "rightsType" TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 100,
 "validFrom" TIMESTAMPTZ(3) NOT NULL, "validTo" TIMESTAMPTZ(3) NOT NULL, enabled BOOLEAN NOT NULL DEFAULT false,
 "evidenceUrl" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "VideoSourceCompetition_videoSourceId_fkey" FOREIGN KEY ("videoSourceId") REFERENCES "VideoSource"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "VideoSourceCompetition_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "League"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 CHECK ("validFrom" < "validTo"), CHECK ("rightsType" IN ('AUTHORIZED_LINK','OFFICIAL_LINK','REVIEWED_FALLBACK'))
);
CREATE UNIQUE INDEX "VideoSourceCompetition_scope_key" ON "VideoSourceCompetition" ("videoSourceId","competitionId",season,market,"validFrom");
CREATE INDEX "VideoSourceCompetition_competitionId_season_enabled_idx" ON "VideoSourceCompetition" ("competitionId",season,enabled);
ALTER TABLE "Video" ADD COLUMN "videoSourceId" UUID, ADD COLUMN "sourceMappingId" UUID,
 ADD COLUMN description TEXT, ADD COLUMN language TEXT, ADD COLUMN "videoType" TEXT NOT NULL DEFAULT 'OTHER',
 ADD COLUMN "availabilityStatus" TEXT NOT NULL DEFAULT 'UNKNOWN', ADD COLUMN "vietnamAvailability" TEXT NOT NULL DEFAULT 'UNKNOWN',
 ADD COLUMN "selectedAsPrimary" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "collectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
 ADD COLUMN "lastCheckedAt" TIMESTAMPTZ(3);
ALTER TABLE "Video" ADD CONSTRAINT "Video_videoSourceId_fkey" FOREIGN KEY ("videoSourceId") REFERENCES "VideoSource"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "Video_sourceMappingId_fkey" FOREIGN KEY ("sourceMappingId") REFERENCES "VideoSourceCompetition"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD CONSTRAINT "Video_type_check" CHECK ("videoType" IN ('HIGHLIGHT','EXTENDED_HIGHLIGHT','GOALS','INTERVIEW','PRESS_CONFERENCE','ANALYSIS','REACTION','WATCH_ALONG','OTHER')),
 ADD CONSTRAINT "Video_availability_check" CHECK ("availabilityStatus" IN ('AVAILABLE','UNAVAILABLE','PRIVATE','REMOVED','UNKNOWN')),
 ADD CONSTRAINT "Video_vietnam_check" CHECK ("vietnamAvailability" IN ('AVAILABLE','UNAVAILABLE','UNKNOWN')),
 ADD CONSTRAINT "Video_primary_requires_validation" CHECK (NOT "selectedAsPrimary" OR ("matchId" IS NOT NULL AND "videoSourceId" IS NOT NULL AND "sourceMappingId" IS NOT NULL AND "validationStatus"='VALIDATED' AND "availabilityStatus"='AVAILABLE' AND "videoType" IN ('HIGHLIGHT','EXTENDED_HIGHLIGHT','GOALS')));
CREATE INDEX "Video_videoSourceId_idx" ON "Video" ("videoSourceId");
CREATE INDEX "Video_sourceMappingId_idx" ON "Video" ("sourceMappingId");
CREATE INDEX "Video_lastCheckedAt_idx" ON "Video" ("lastCheckedAt");
CREATE UNIQUE INDEX "Video_one_primary_per_match" ON "Video" ("matchId") WHERE "selectedAsPrimary";
CREATE TABLE "VideoSyncState" (
 "matchId" UUID PRIMARY KEY, "inputHash" TEXT NOT NULL, "nextSearchAt" TIMESTAMPTZ(3) NOT NULL, "lastSearchedAt" TIMESTAMPTZ(3) NOT NULL,
 CONSTRAINT "VideoSyncState_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "VideoSyncState_nextSearchAt_idx" ON "VideoSyncState" ("nextSearchAt");
