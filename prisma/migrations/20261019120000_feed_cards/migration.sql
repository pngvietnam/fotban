-- Additive only. Attributed publisher RSS cards are a separate, lower publication class than
-- verified ArticleCluster stories. No existing row or constraint is changed.

-- CreateTable
CREATE TABLE "FeedCard" (
    "articleId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "storyType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "certainty" TEXT NOT NULL,
    "transferStage" TEXT,
    "originHint" TEXT,
    "holdReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "groupKey" UUID,
    "matchId" UUID,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FeedCard_pkey" PRIMARY KEY ("articleId")
);

-- CreateIndex
CREATE INDEX "FeedCard_status_groupKey_idx" ON "FeedCard"("status", "groupKey");

-- CreateIndex
CREATE INDEX "FeedCard_matchId_idx" ON "FeedCard"("matchId");

-- AddForeignKey
ALTER TABLE "FeedCard" ADD CONSTRAINT "FeedCard_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCard" ADD CONSTRAINT "FeedCard_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCard" ADD CONSTRAINT "FeedCard_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A media card can never claim official confirmation; a transfer card never says CONFIRMED.
ALTER TABLE "FeedCard" ADD CONSTRAINT "FeedCard_values" CHECK (
  "status" IN ('PUBLISHED', 'HELD', 'HIDDEN')
  AND "label" IN ('MEDIA', 'COMMUNITY')
  AND "certainty" IN ('REPORTED', 'UNCONFIRMED')
  AND ("transferStage" IS NULL OR "transferStage" IN ('INTEREST', 'NEGOTIATION', 'RUMOR'))
  AND "holdReasons" IS NOT NULL);
-- A manual decision always names who made it and when.
ALTER TABLE "FeedCard" ADD CONSTRAINT "FeedCard_decision" CHECK (("decidedById" IS NULL) = ("decidedAt" IS NULL));
