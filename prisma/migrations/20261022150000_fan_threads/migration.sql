-- Community discussions the site links to (forum threads, subreddit posts): the title and public counts only, never post
-- text or user names. Clubs, players, leagues and the match are matched from the title. Additive only.
CREATE TABLE "FanThread" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "community" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "replies" INTEGER,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "clubIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "playerIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "leagueIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "matchId" UUID,
    "held" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "FanThread_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FanThread_source_externalId_key" ON "FanThread"("source", "externalId");
CREATE INDEX "FanThread_lastActivityAt_idx" ON "FanThread"("lastActivityAt");
CREATE INDEX "FanThread_matchId_idx" ON "FanThread"("matchId");

-- One reading of a thread's reply count per hour at most: the change over a day is how lively the thread is.
CREATE TABLE "FanThreadSnapshot" (
    "threadId" UUID NOT NULL,
    "takenAt" TIMESTAMPTZ(3) NOT NULL,
    "replies" INTEGER NOT NULL,

    CONSTRAINT "FanThreadSnapshot_pkey" PRIMARY KEY ("threadId", "takenAt")
);
ALTER TABLE "FanThreadSnapshot" ADD CONSTRAINT "FanThreadSnapshot_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "FanThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
