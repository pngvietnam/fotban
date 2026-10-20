-- Additive only. Per-player box scores (ratings, minutes, per-player figures) are merged into the
-- stored lineup; these columns track when they were read.
ALTER TABLE "MatchDetailSync" ADD COLUMN "boxScoreFetchedAt" TIMESTAMPTZ(3);
ALTER TABLE "MatchDetailSync" ADD COLUMN "boxScoreAttempts" INTEGER NOT NULL DEFAULT 0;
