-- Additive only. Shots (minute, player, outcome, where in the goal frame) and venue/weather from the
-- match detail response; no existing row is changed.

-- CreateTable
CREATE TABLE "MatchShot" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "playerName" TEXT,
    "playerId" UUID,
    "minute" INTEGER,
    "addedMinute" INTEGER,
    "outcome" TEXT NOT NULL,
    "goalTarget" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MatchShot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchShot_matchId_provider_sequence_key" ON "MatchShot"("matchId", "provider", "sequence");
CREATE INDEX "MatchShot_clubId_idx" ON "MatchShot"("clubId");
CREATE INDEX "MatchShot_playerId_idx" ON "MatchShot"("playerId");

ALTER TABLE "MatchShot" ADD CONSTRAINT "MatchShot_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchShot" ADD CONSTRAINT "MatchShot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchShot" ADD CONSTRAINT "MatchShot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchShot" ADD CONSTRAINT "MatchShot_outcome" CHECK ("outcome" IN ('GOAL', 'SAVED', 'MISSED', 'BLOCKED', 'POST', 'OTHER'));

-- Venue and weather as reported with the match details.
ALTER TABLE "MatchDetailSync" ADD COLUMN "venueName" TEXT;
ALTER TABLE "MatchDetailSync" ADD COLUMN "venueCity" TEXT;
ALTER TABLE "MatchDetailSync" ADD COLUMN "venueCapacity" INTEGER;
ALTER TABLE "MatchDetailSync" ADD COLUMN "weather" TEXT;
ALTER TABLE "MatchDetailSync" ADD COLUMN "temperatureC" DECIMAL(4,1);
