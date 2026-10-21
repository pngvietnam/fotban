-- Per league: the provider's current matchday, competition emblem and top scorers (JSON as normalised).
-- Refreshed by the worker every few hours. Additive only.
CREATE TABLE "LeagueLeaders" (
    "leagueId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "currentMatchday" INTEGER,
    "emblemUrl" TEXT,
    "scorers" JSONB NOT NULL DEFAULT '[]',
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LeagueLeaders_pkey" PRIMARY KEY ("leagueId")
);

ALTER TABLE "LeagueLeaders" ADD CONSTRAINT "LeagueLeaders_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
