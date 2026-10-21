-- Past meetings of two clubs in every competition, as the data provider lists them. One row per pair of
-- provider team ids (smaller id first), shared by every match between those clubs. Additive only.
CREATE TABLE "HeadToHead" (
    "provider" TEXT NOT NULL,
    "teamA" TEXT NOT NULL,
    "teamB" TEXT NOT NULL,
    "meetings" JSONB NOT NULL DEFAULT '[]',
    "fetchedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HeadToHead_pkey" PRIMARY KEY ("provider", "teamA", "teamB")
);
