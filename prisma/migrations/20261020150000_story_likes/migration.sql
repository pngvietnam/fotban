-- Likes on feed stories by signed-in readers (guests keep theirs in the browser). Additive only.
CREATE TABLE "StoryLike" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryLike_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoryLike_userId_articleId_key" ON "StoryLike"("userId", "articleId");
CREATE INDEX "StoryLike_articleId_idx" ON "StoryLike"("articleId");

ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryLike" ADD CONSTRAINT "StoryLike_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
