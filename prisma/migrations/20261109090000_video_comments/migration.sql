-- What Vietnamese viewers write under the stored highlight videos (YouTube Data API): the comment text, its like count
-- and time only. Commenter names, avatars and channel ids are never stored. Rows older than 30 days are deleted (YouTube
-- API policy); clubs and players named in the text are matched when the comment is read. Additive only.
CREATE TABLE "VideoComment" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "clubIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "playerIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],

    CONSTRAINT "VideoComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VideoComment_text_length" CHECK (char_length("text") BETWEEN 1 AND 500),
    CONSTRAINT "VideoComment_likes" CHECK ("likeCount" >= 0)
);
CREATE UNIQUE INDEX "VideoComment_externalId_key" ON "VideoComment"("externalId");
CREATE INDEX "VideoComment_videoId_idx" ON "VideoComment"("videoId");
CREATE INDEX "VideoComment_fetchedAt_idx" ON "VideoComment"("fetchedAt");
CREATE INDEX "VideoComment_publishedAt_idx" ON "VideoComment"("publishedAt");
ALTER TABLE "VideoComment" ADD CONSTRAINT "VideoComment_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per video: when its comments were last read, the video's public comment total and how many were read and kept.
CREATE TABLE "VideoCommentFetch" (
    "videoId" UUID NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL,
    "commentCount" INTEGER,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "keptCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VideoCommentFetch_pkey" PRIMARY KEY ("videoId"),
    CONSTRAINT "VideoCommentFetch_status_check" CHECK ("status" IN ('OK','DISABLED','NOT_FOUND'))
);
CREATE INDEX "VideoCommentFetch_fetchedAt_idx" ON "VideoCommentFetch"("fetchedAt");
ALTER TABLE "VideoCommentFetch" ADD CONSTRAINT "VideoCommentFetch_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
