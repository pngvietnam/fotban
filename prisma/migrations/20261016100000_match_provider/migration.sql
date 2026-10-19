BEGIN;

-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "country" TEXT,
ADD COLUMN     "externalCrestUrl" TEXT,
ADD COLUMN     "shortName" TEXT,
ADD COLUMN     "tla" TEXT,
ADD COLUMN     "venue" TEXT;

-- AlterTable
ALTER TABLE "ExternalIdentity" ADD COLUMN     "matchId" UUID,
ADD COLUMN     "seasonId" UUID;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "providerUpdatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "scoreDuration" TEXT;

-- AlterTable
ALTER TABLE "ProviderStatus" ADD COLUMN     "cooldownUntil" TIMESTAMPTZ(3),
ADD COLUMN     "lastFailureAt" TIMESTAMPTZ(3),
ADD COLUMN     "nextRequestAt" TIMESTAMPTZ(3),
ADD COLUMN     "recordsProcessed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Standing" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "leagueId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "stage" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT '',
    "tableType" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "playedGames" INTEGER,
    "won" INTEGER,
    "drawn" INTEGER,
    "lost" INTEGER,
    "points" INTEGER,
    "goalsFor" INTEGER,
    "goalsAgainst" INTEGER,
    "goalDifference" INTEGER,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Standing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Standing_leagueId_seasonId_tableType_position_idx" ON "Standing"("leagueId", "seasonId", "tableType", "position");

-- CreateIndex
CREATE INDEX "Standing_seasonId_leagueId_idx" ON "Standing"("seasonId", "leagueId");

-- CreateIndex
CREATE INDEX "Standing_clubId_idx" ON "Standing"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Standing_provider_seasonId_stage_group_tableType_clubId_key" ON "Standing"("provider", "seasonId", "stage", "group", "tableType", "clubId");

-- CreateIndex
CREATE INDEX "ExternalIdentity_seasonId_idx" ON "ExternalIdentity"("seasonId");

-- CreateIndex
CREATE INDEX "ExternalIdentity_matchId_idx" ON "ExternalIdentity"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_seasonId_key" ON "ExternalIdentity"("provider", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_matchId_key" ON "ExternalIdentity"("provider", "matchId");

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_seasonId_leagueId_fkey" FOREIGN KEY ("seasonId", "leagueId") REFERENCES "Season"("id", "leagueId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Extend the existing typed identity invariant without weakening its one-target rule.
ALTER TABLE "ExternalIdentity" DROP CONSTRAINT "ExternalIdentity_target_type";
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_target_type" CHECK (
  num_nonnulls("leagueId","clubId","playerId","seasonId","matchId") = 1 AND (
    ("entityType"='LEAGUE' AND "leagueId" IS NOT NULL) OR
    ("entityType"='CLUB' AND "clubId" IS NOT NULL) OR
    ("entityType"='PLAYER' AND "playerId" IS NOT NULL) OR
    ("entityType"='SEASON' AND "seasonId" IS NOT NULL) OR
    ("entityType"='MATCH' AND "matchId" IS NOT NULL)));
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_counts" CHECK (
  position > 0 AND "playedGames" >= 0 AND won >= 0 AND drawn >= 0 AND lost >= 0
  AND "goalsFor" >= 0 AND "goalsAgainst" >= 0);
ALTER TABLE "ProviderStatus" ADD CONSTRAINT "ProviderStatus_records" CHECK ("recordsProcessed" >= 0);

-- Keep pre-existing match primary identities discoverable through the shared mapping.
INSERT INTO "ExternalIdentity" (id,provider,"entityType","externalId","matchId","updatedAt")
  SELECT gen_random_uuid(),provider,'MATCH',"externalId",id,now() FROM "Match"
  ON CONFLICT (provider,"entityType","externalId") DO NOTHING;

COMMIT;
