-- Additive only. Match events, statistics and lineups from a detail provider (Highlightly free plan);
-- no existing row is changed.

-- Event players are often given only as a short name ("M. Salah"); the name is kept even when no
-- canonical Player can be matched.
ALTER TABLE "MatchEvent" ADD COLUMN "playerName" TEXT;
ALTER TABLE "MatchEvent" ADD COLUMN "relatedPlayerName" TEXT;

-- CreateTable
CREATE TABLE "MatchLineup" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "formation" TEXT,
    "players" JSONB NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MatchLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchDetailSync" (
    "matchId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "homeTeamExternalId" TEXT,
    "awayTeamExternalId" TEXT,
    "referee" TEXT,
    "mapAttemptAt" TIMESTAMPTZ(3),
    "lineupsFetchedAt" TIMESTAMPTZ(3),
    "lineupAttempts" INTEGER NOT NULL DEFAULT 0,
    "detailFetchedAt" TIMESTAMPTZ(3),
    "detailAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MatchDetailSync_pkey" PRIMARY KEY ("matchId", "provider")
);

-- CreateTable
CREATE TABLE "ProviderQuota" (
    "provider" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProviderQuota_pkey" PRIMARY KEY ("provider", "day")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchLineup_matchId_clubId_provider_key" ON "MatchLineup"("matchId", "clubId", "provider");
CREATE INDEX "MatchLineup_clubId_idx" ON "MatchLineup"("clubId");
CREATE UNIQUE INDEX "MatchDetailSync_provider_externalId_key" ON "MatchDetailSync"("provider", "externalId");

-- AddForeignKey
ALTER TABLE "MatchLineup" ADD CONSTRAINT "MatchLineup_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchLineup" ADD CONSTRAINT "MatchLineup_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MatchDetailSync" ADD CONSTRAINT "MatchDetailSync_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MatchLineup" ADD CONSTRAINT "MatchLineup_players_array" CHECK (jsonb_typeof("players") = 'array');
ALTER TABLE "ProviderQuota" ADD CONSTRAINT "ProviderQuota_used_nonnegative" CHECK ("used" >= 0);
