-- Provider player profiles (Highlightly): recorded transfers with fees, market value, contract, injuries.
-- One row per player; lists are stored as JSON exactly as normalised. Additive only.
CREATE TABLE "PlayerProfile" (
    "playerId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "club" TEXT,
    "joinedAt" DATE,
    "contractExpiry" DATE,
    "marketValue" DECIMAL(18,2),
    "marketValueCurrency" VARCHAR(3),
    "marketValueAt" DATE,
    "transfers" JSONB NOT NULL DEFAULT '[]',
    "rumours" JSONB NOT NULL DEFAULT '[]',
    "injuries" JSONB NOT NULL DEFAULT '[]',
    "fetchedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("playerId", "provider")
);

CREATE INDEX "PlayerProfile_fetchedAt_idx" ON "PlayerProfile"("fetchedAt");

ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
