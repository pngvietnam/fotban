-- Additive only. Existing permissions, articles and immutable history are preserved.
ALTER TABLE "NewsSource"
 ADD COLUMN "permissionScope" text NOT NULL DEFAULT 'NONE',
 ADD COLUMN "feedUrl" text,
 ADD COLUMN "attributionRequirement" text,
 ADD COLUMN "lastTermsReviewAt" timestamptz(3),
 ADD COLUMN "newsPriority" integer NOT NULL DEFAULT 1000 CHECK ("newsPriority" BETWEEN 0 AND 1000),
 ADD COLUMN "ingestionNotes" text,
 ADD CONSTRAINT "NewsSource_feed_scope" CHECK ("permissionScope" IN ('NONE','DISCOVERY_METADATA','RSS_METADATA','RSS_SUMMARY'));
CREATE TABLE "ArticleFeedSnapshot" (
 "articleId" uuid PRIMARY KEY REFERENCES "Article"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "sourceId" uuid NOT NULL,
 "feedUrl" text NOT NULL,
 "termsUrl" text NOT NULL,
 "permissionScope" text NOT NULL CHECK ("permissionScope" IN ('RSS_METADATA','RSS_SUMMARY')),
 "attributionText" text NOT NULL,
 "reviewedAt" timestamptz(3) NOT NULL,
 title text NOT NULL,
 excerpt text,
 "publishedAt" timestamptz(3) NOT NULL,
 categories text[] NOT NULL DEFAULT '{}',
 "evidenceReferences" text[] NOT NULL DEFAULT '{}',
 "collectedAt" timestamptz(3) NOT NULL DEFAULT now()
);
