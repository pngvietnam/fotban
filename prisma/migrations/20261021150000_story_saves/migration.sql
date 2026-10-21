-- Stories saved by signed-in readers (guests keep theirs in the browser until they log in). Additive only.
CREATE TABLE "StorySave" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorySave_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorySave_userId_articleId_key" ON "StorySave"("userId", "articleId");
CREATE INDEX "StorySave_articleId_idx" ON "StorySave"("articleId");

ALTER TABLE "StorySave" ADD CONSTRAINT "StorySave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorySave" ADD CONSTRAINT "StorySave_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
