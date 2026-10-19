BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'EDITOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'HALFTIME', 'FINISHED', 'POSTPONED', 'CANCELLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MatchEventType" AS ENUM ('GOAL', 'OWN_GOAL', 'PENALTY', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL', 'NEWS_API', 'RSS', 'PUBLICATION', 'SOCIAL');

-- CreateEnum
CREATE TYPE "ReliabilityClass" AS ENUM ('OFFICIAL', 'RELIABLE', 'SOCIAL', 'RUMOR');

-- CreateEnum
CREATE TYPE "StoryType" AS ENUM ('MATCH', 'PLAYER', 'CLUB', 'TRANSFER', 'INJURY', 'MANAGER', 'TACTICAL', 'CONTRACT', 'FINANCIAL', 'OFF_FIELD', 'INTERVIEW', 'DISCIPLINE', 'SOCIAL');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('CONFIRMED', 'NEGOTIATION', 'INTEREST', 'RUMOR');

-- CreateEnum
CREATE TYPE "RumorStatus" AS ENUM ('NOT_APPLICABLE', 'UNCONFIRMED', 'CONFIRMED', 'DENIED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'FAILED');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('DRAFT', 'VALIDATING', 'READY', 'PUBLISHED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "BriefSection" AS ENUM ('MORNING_SUMMARY', 'LAST_NIGHT_MATCHES', 'TOP_MATCH_INSIGHTS', 'PLAYER_SPOTLIGHT', 'CLUB_STORIES', 'TRANSFER_WATCH', 'COMING_UP', 'MORE_NEWS');

-- CreateEnum
CREATE TYPE "VideoTrustLevel" AS ENUM ('UNKNOWN', 'LEAGUE_OFFICIAL', 'CLUB_OFFICIAL', 'RIGHTS_HOLDER', 'REVIEWED');

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProviderHealth" AS ENUM ('UNCONFIGURED', 'HEALTHY', 'WARNING', 'ERROR', 'DISABLED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "authProvider" TEXT NOT NULL,
    "authSubject" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "locale" TEXT NOT NULL DEFAULT 'vi-VN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubSeason" (
    "id" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "leagueId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClubSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logoUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "position" TEXT,
    "nationality" TEXT,
    "birthDate" DATE,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerClub" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "sourceUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlayerClub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "leagueId" UUID,
    "clubId" UUID,
    "playerId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "leagueId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "round" TEXT,
    "homeClubId" UUID NOT NULL,
    "awayClubId" UUID NOT NULL,
    "kickoffAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "homeExtraTimeScore" INTEGER,
    "awayExtraTimeScore" INTEGER,
    "homePenaltyScore" INTEGER,
    "awayPenaltyScore" INTEGER,
    "venue" TEXT,
    "sourceUrl" TEXT,
    "lastUpdatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "clubId" UUID,
    "playerId" UUID,
    "relatedPlayerId" UUID,
    "type" "MatchEventType" NOT NULL,
    "minute" INTEGER,
    "addedMinute" INTEGER,
    "period" TEXT,
    "detail" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchStat" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "playerId" UUID,
    "provider" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'FULL_MATCH',
    "value" DECIMAL(18,6) NOT NULL,
    "unit" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MatchStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsSource" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "externalIdentity" TEXT,
    "reliabilityScore" INTEGER NOT NULL DEFAULT 0,
    "rationale" TEXT,
    "reviewer" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "accessPolicy" TEXT NOT NULL,
    "retentionDays" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NewsSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "sourceId" UUID NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "titleOriginal" TEXT NOT NULL,
    "contentOriginal" TEXT,
    "excerptOriginal" TEXT,
    "language" TEXT NOT NULL,
    "titleVi" TEXT,
    "summaryVi" TEXT,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "collectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storyType" "StoryType",
    "rumorStatus" "RumorStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "reliabilityClass" "ReliabilityClass",
    "reliabilityScore" INTEGER,
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "publicationStatus" "PublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "clusterId" UUID,
    "manualOverrideAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleCluster" (
    "id" UUID NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "representativeArticleId" UUID,
    "selectionReason" TEXT,
    "algorithmVersion" TEXT,
    "hasConflict" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ArticleCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleEntity" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "clubId" UUID,
    "playerId" UUID,
    "leagueId" UUID,
    "matchId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ArticleEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "durationSeconds" INTEGER,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "trustLevel" "VideoTrustLevel" NOT NULL DEFAULT 'UNKNOWN',
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PENDING',
    "validationReason" TEXT,
    "checkedAt" TIMESTAMPTZ(3),
    "embedAllowed" BOOLEAN,
    "matchId" UUID,
    "sourceId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBrief" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi-VN',
    "status" "BriefStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefRevision" (
    "id" UUID NOT NULL,
    "briefId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" "BriefStatus" NOT NULL DEFAULT 'DRAFT',
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "windowEnd" TIMESTAMPTZ(3) NOT NULL,
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL,
    "inputHash" TEXT NOT NULL,
    "rankingVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "correctionReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BriefRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefItem" (
    "id" UUID NOT NULL,
    "briefId" UUID NOT NULL,
    "revisionId" UUID NOT NULL,
    "section" "BriefSection" NOT NULL,
    "position" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "articleId" UUID,
    "clusterId" UUID,
    "matchId" UUID,
    "videoId" UUID,
    "importanceScore" DECIMAL(5,2),
    "inputSnapshot" JSONB NOT NULL,
    "componentScores" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BriefItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'vi-VN',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFollow" (
    "id" UUID NOT NULL,
    "preferenceId" UUID NOT NULL,
    "leagueId" UUID,
    "clubId" UUID,
    "playerId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" UUID NOT NULL,
    "jobName" TEXT NOT NULL,
    "logicalKey" TEXT NOT NULL,
    "logicalDate" DATE,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorSafe" TEXT,
    "correlationId" UUID NOT NULL,
    "checkpoint" JSONB,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderStatus" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "health" "ProviderHealth" NOT NULL DEFAULT 'UNCONFIGURED',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMPTZ(3),
    "lastSuccessAt" TIMESTAMPTZ(3),
    "dataUpdatedAt" TIMESTAMPTZ(3),
    "latencyMs" INTEGER,
    "errorCode" TEXT,
    "errorSafe" TEXT,
    "checkpoint" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProviderStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimEvidence" (
    "id" UUID NOT NULL,
    "articleId" UUID,
    "claim" TEXT NOT NULL,
    "sourceArticleId" UUID,
    "matchId" UUID,
    "fieldPath" TEXT,
    "locator" TEXT,
    "excerpt" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClaimEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefItemEvidence" (
    "briefItemId" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BriefItemEvidence_pkey" PRIMARY KEY ("briefItemId","evidenceId")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "original" TEXT NOT NULL,
    "translated" TEXT,
    "speaker" TEXT,
    "locator" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProcessingRun" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "outputVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "output" JSONB,
    "validationOutcome" JSONB,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "errorSafe" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AIProcessingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "currentClubId" UUID,
    "targetClubId" UUID,
    "status" "TransferStatus" NOT NULL DEFAULT 'RUMOR',
    "dealType" TEXT,
    "fee" DECIMAL(18,2),
    "currency" VARCHAR(3),
    "contractStartsAt" DATE,
    "contractEndsAt" DATE,
    "summary" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferUpdate" (
    "id" UUID NOT NULL,
    "transferId" UUID NOT NULL,
    "evidenceId" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "publishedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TransferUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_authProvider_authSubject_key" ON "User"("authProvider", "authSubject");

-- CreateIndex
CREATE UNIQUE INDEX "League_slug_key" ON "League"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Season_leagueId_name_key" ON "Season"("leagueId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Season_id_leagueId_key" ON "Season"("id", "leagueId");

-- CreateIndex
CREATE INDEX "ClubSeason_seasonId_leagueId_idx" ON "ClubSeason"("seasonId", "leagueId");

-- CreateIndex
CREATE INDEX "ClubSeason_leagueId_idx" ON "ClubSeason"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubSeason_clubId_seasonId_key" ON "ClubSeason"("clubId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "Club_slug_key" ON "Club"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Player_slug_key" ON "Player"("slug");

-- CreateIndex
CREATE INDEX "PlayerClub_clubId_startsAt_idx" ON "PlayerClub"("clubId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerClub_playerId_clubId_startsAt_key" ON "PlayerClub"("playerId", "clubId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_entityType_externalId_key" ON "ExternalIdentity"("provider", "entityType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_leagueId_key" ON "ExternalIdentity"("provider", "leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_clubId_key" ON "ExternalIdentity"("provider", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_playerId_key" ON "ExternalIdentity"("provider", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_slug_key" ON "Match"("slug");

-- CreateIndex
CREATE INDEX "Match_kickoffAt_idx" ON "Match"("kickoffAt");

-- CreateIndex
CREATE INDEX "Match_leagueId_kickoffAt_idx" ON "Match"("leagueId", "kickoffAt");

-- CreateIndex
CREATE INDEX "Match_seasonId_leagueId_idx" ON "Match"("seasonId", "leagueId");

-- CreateIndex
CREATE INDEX "Match_homeClubId_kickoffAt_idx" ON "Match"("homeClubId", "kickoffAt");

-- CreateIndex
CREATE INDEX "Match_awayClubId_kickoffAt_idx" ON "Match"("awayClubId", "kickoffAt");

-- CreateIndex
CREATE UNIQUE INDEX "Match_provider_externalId_key" ON "Match"("provider", "externalId");

-- CreateIndex
CREATE INDEX "MatchEvent_matchId_minute_idx" ON "MatchEvent"("matchId", "minute");

-- CreateIndex
CREATE INDEX "MatchEvent_clubId_idx" ON "MatchEvent"("clubId");

-- CreateIndex
CREATE INDEX "MatchEvent_playerId_idx" ON "MatchEvent"("playerId");

-- CreateIndex
CREATE INDEX "MatchEvent_relatedPlayerId_idx" ON "MatchEvent"("relatedPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchEvent_provider_matchId_externalId_key" ON "MatchEvent"("provider", "matchId", "externalId");

-- CreateIndex
CREATE INDEX "MatchStat_matchId_metric_idx" ON "MatchStat"("matchId", "metric");

-- CreateIndex
CREATE INDEX "MatchStat_clubId_idx" ON "MatchStat"("clubId");

-- CreateIndex
CREATE INDEX "MatchStat_playerId_idx" ON "MatchStat"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsSource_domain_key" ON "NewsSource"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Article_sourceUrl_key" ON "Article"("sourceUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Article_canonicalUrl_key" ON "Article"("canonicalUrl");

-- CreateIndex
CREATE INDEX "Article_publicationStatus_publishedAt_idx" ON "Article"("publicationStatus", "publishedAt");

-- CreateIndex
CREATE INDEX "Article_sourceId_publishedAt_idx" ON "Article"("sourceId", "publishedAt");

-- CreateIndex
CREATE INDEX "Article_clusterId_idx" ON "Article"("clusterId");

-- CreateIndex
CREATE INDEX "Article_storyType_publishedAt_idx" ON "Article"("storyType", "publishedAt");

-- CreateIndex
CREATE INDEX "Article_processingStatus_collectedAt_idx" ON "Article"("processingStatus", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleCluster_representativeArticleId_key" ON "ArticleCluster"("representativeArticleId");

-- CreateIndex
CREATE INDEX "ArticleEntity_clubId_idx" ON "ArticleEntity"("clubId");

-- CreateIndex
CREATE INDEX "ArticleEntity_playerId_idx" ON "ArticleEntity"("playerId");

-- CreateIndex
CREATE INDEX "ArticleEntity_leagueId_idx" ON "ArticleEntity"("leagueId");

-- CreateIndex
CREATE INDEX "ArticleEntity_matchId_idx" ON "ArticleEntity"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleEntity_articleId_clubId_key" ON "ArticleEntity"("articleId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleEntity_articleId_playerId_key" ON "ArticleEntity"("articleId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleEntity_articleId_leagueId_key" ON "ArticleEntity"("articleId", "leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleEntity_articleId_matchId_key" ON "ArticleEntity"("articleId", "matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Video_url_key" ON "Video"("url");

-- CreateIndex
CREATE INDEX "Video_matchId_validationStatus_idx" ON "Video"("matchId", "validationStatus");

-- CreateIndex
CREATE INDEX "Video_sourceId_idx" ON "Video"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "Video_provider_externalId_key" ON "Video"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBrief_date_locale_key" ON "DailyBrief"("date", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "BriefRevision_briefId_revision_key" ON "BriefRevision"("briefId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "BriefRevision_id_briefId_key" ON "BriefRevision"("id", "briefId");

-- CreateIndex
CREATE INDEX "BriefItem_revisionId_briefId_idx" ON "BriefItem"("revisionId", "briefId");

-- CreateIndex
CREATE INDEX "BriefItem_articleId_idx" ON "BriefItem"("articleId");

-- CreateIndex
CREATE INDEX "BriefItem_clusterId_idx" ON "BriefItem"("clusterId");

-- CreateIndex
CREATE INDEX "BriefItem_matchId_idx" ON "BriefItem"("matchId");

-- CreateIndex
CREATE INDEX "BriefItem_videoId_idx" ON "BriefItem"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefItem_revisionId_section_position_key" ON "BriefItem"("revisionId", "section", "position");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "UserFollow_leagueId_idx" ON "UserFollow"("leagueId");

-- CreateIndex
CREATE INDEX "UserFollow_clubId_idx" ON "UserFollow"("clubId");

-- CreateIndex
CREATE INDEX "UserFollow_playerId_idx" ON "UserFollow"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFollow_preferenceId_leagueId_key" ON "UserFollow"("preferenceId", "leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFollow_preferenceId_clubId_key" ON "UserFollow"("preferenceId", "clubId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFollow_preferenceId_playerId_key" ON "UserFollow"("preferenceId", "playerId");

-- CreateIndex
CREATE INDEX "JobRun_status_startedAt_idx" ON "JobRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "JobRun_createdAt_idx" ON "JobRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_jobName_logicalKey_key" ON "JobRun"("jobName", "logicalKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderStatus_provider_key" ON "ProviderStatus"("provider");

-- CreateIndex
CREATE INDEX "ClaimEvidence_articleId_idx" ON "ClaimEvidence"("articleId");

-- CreateIndex
CREATE INDEX "ClaimEvidence_sourceArticleId_idx" ON "ClaimEvidence"("sourceArticleId");

-- CreateIndex
CREATE INDEX "ClaimEvidence_matchId_idx" ON "ClaimEvidence"("matchId");

-- CreateIndex
CREATE INDEX "BriefItemEvidence_evidenceId_idx" ON "BriefItemEvidence"("evidenceId");

-- CreateIndex
CREATE INDEX "Quote_articleId_idx" ON "Quote"("articleId");

-- CreateIndex
CREATE INDEX "AIProcessingRun_status_createdAt_idx" ON "AIProcessingRun"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIProcessingRun_articleId_inputHash_promptVersion_schemaVer_key" ON "AIProcessingRun"("articleId", "inputHash", "promptVersion", "schemaVersion", "outputVersion");

-- CreateIndex
CREATE INDEX "Transfer_playerId_updatedAt_idx" ON "Transfer"("playerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Transfer_currentClubId_idx" ON "Transfer"("currentClubId");

-- CreateIndex
CREATE INDEX "Transfer_targetClubId_idx" ON "Transfer"("targetClubId");

-- CreateIndex
CREATE INDEX "Transfer_status_updatedAt_idx" ON "Transfer"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TransferUpdate_evidenceId_idx" ON "TransferUpdate"("evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "TransferUpdate_transferId_evidenceId_status_key" ON "TransferUpdate"("transferId", "evidenceId", "status");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorId_createdAt_idx" ON "AdminAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_createdAt_idx" ON "AdminAuditLog"("targetType", "targetId", "createdAt");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubSeason" ADD CONSTRAINT "ClubSeason_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubSeason" ADD CONSTRAINT "ClubSeason_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubSeason" ADD CONSTRAINT "ClubSeason_seasonId_leagueId_fkey" FOREIGN KEY ("seasonId", "leagueId") REFERENCES "Season"("id", "leagueId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerClub" ADD CONSTRAINT "PlayerClub_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerClub" ADD CONSTRAINT "PlayerClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_seasonId_leagueId_fkey" FOREIGN KEY ("seasonId", "leagueId") REFERENCES "Season"("id", "leagueId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_relatedPlayerId_fkey" FOREIGN KEY ("relatedPlayerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchStat" ADD CONSTRAINT "MatchStat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchStat" ADD CONSTRAINT "MatchStat_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchStat" ADD CONSTRAINT "MatchStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "ArticleCluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleCluster" ADD CONSTRAINT "ArticleCluster_representativeArticleId_fkey" FOREIGN KEY ("representativeArticleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEntity" ADD CONSTRAINT "ArticleEntity_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEntity" ADD CONSTRAINT "ArticleEntity_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEntity" ADD CONSTRAINT "ArticleEntity_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEntity" ADD CONSTRAINT "ArticleEntity_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleEntity" ADD CONSTRAINT "ArticleEntity_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "NewsSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefRevision" ADD CONSTRAINT "BriefRevision_briefId_fkey" FOREIGN KEY ("briefId") REFERENCES "DailyBrief"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_revisionId_briefId_fkey" FOREIGN KEY ("revisionId", "briefId") REFERENCES "BriefRevision"("id", "briefId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "ArticleCluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_preferenceId_fkey" FOREIGN KEY ("preferenceId") REFERENCES "UserPreference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefItemEvidence" ADD CONSTRAINT "BriefItemEvidence_briefItemId_fkey" FOREIGN KEY ("briefItemId") REFERENCES "BriefItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefItemEvidence" ADD CONSTRAINT "BriefItemEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "ClaimEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProcessingRun" ADD CONSTRAINT "AIProcessingRun_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_currentClubId_fkey" FOREIGN KEY ("currentClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_targetClubId_fkey" FOREIGN KEY ("targetClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferUpdate" ADD CONSTRAINT "TransferUpdate_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferUpdate" ADD CONSTRAINT "TransferUpdate_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "ClaimEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL invariants Prisma cannot express. Keep these when changing the schema.
CREATE INDEX "ExternalIdentity_leagueId_idx" ON "ExternalIdentity"("leagueId");
CREATE INDEX "ExternalIdentity_clubId_idx" ON "ExternalIdentity"("clubId");
CREATE INDEX "ExternalIdentity_playerId_idx" ON "ExternalIdentity"("playerId");
ALTER TABLE "ArticleEntity" ADD CONSTRAINT "ArticleEntity_one_target"
  CHECK (num_nonnulls("clubId", "playerId", "leagueId", "matchId") = 1);
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_one_target"
  CHECK (num_nonnulls("leagueId", "clubId", "playerId") = 1);
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_target_type"
  CHECK (num_nonnulls("leagueId", "clubId", "playerId") = 1 AND
    (("entityType" = 'LEAGUE' AND "leagueId" IS NOT NULL) OR
     ("entityType" = 'CLUB' AND "clubId" IS NOT NULL) OR
     ("entityType" = 'PLAYER' AND "playerId" IS NOT NULL)));
ALTER TABLE "Match" ADD CONSTRAINT "Match_different_clubs" CHECK ("homeClubId" <> "awayClubId");
ALTER TABLE "Match" ADD CONSTRAINT "Match_scores"
  CHECK (("homeScore" IS NULL) = ("awayScore" IS NULL)
    AND ("homeExtraTimeScore" IS NULL) = ("awayExtraTimeScore" IS NULL)
    AND ("homePenaltyScore" IS NULL) = ("awayPenaltyScore" IS NULL)
    AND "homeScore" >= 0 AND "awayScore" >= 0
    AND "homeExtraTimeScore" >= 0 AND "awayExtraTimeScore" >= 0
    AND "homePenaltyScore" >= 0 AND "awayPenaltyScore" >= 0);
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_time" CHECK ("minute" >= 0 AND "addedMinute" >= 0);
ALTER TABLE "NewsSource" ADD CONSTRAINT "NewsSource_score" CHECK ("reliabilityScore" BETWEEN 0 AND 100);
ALTER TABLE "NewsSource" ADD CONSTRAINT "NewsSource_retention" CHECK ("retentionDays" > 0);
ALTER TABLE "Article" ADD CONSTRAINT "Article_score" CHECK ("reliabilityScore" BETWEEN 0 AND 100);
ALTER TABLE "Article" ADD CONSTRAINT "Article_source_urls" CHECK (btrim("sourceUrl") <> '' AND btrim("canonicalUrl") <> '');
ALTER TABLE "Article" ADD CONSTRAINT "Article_publishable_fields" CHECK (
  "publicationStatus" <> 'PUBLISHED' OR
  ("processingStatus" = 'READY' AND "reliabilityClass" IS NOT NULL AND "storyType" IS NOT NULL
    AND "titleVi" IS NOT NULL AND btrim("titleVi") <> ''
    AND "summaryVi" IS NOT NULL AND btrim("summaryVi") <> ''));
ALTER TABLE "Season" ADD CONSTRAINT "Season_dates" CHECK ("endsAt" >= "startsAt");
ALTER TABLE "PlayerClub" ADD CONSTRAINT "PlayerClub_dates" CHECK ("endsAt" >= "startsAt");
ALTER TABLE "Video" ADD CONSTRAINT "Video_duration" CHECK ("durationSeconds" >= 0);
ALTER TABLE "BriefRevision" ADD CONSTRAINT "BriefRevision_window"
  CHECK ("revision" > 0 AND "windowStart" < "windowEnd" AND "windowEnd" <= "cutoffAt");
ALTER TABLE "BriefRevision" ADD CONSTRAINT "BriefRevision_publication_time"
  CHECK ("status" <> 'PUBLISHED' OR ("generatedAt" IS NOT NULL AND "publishedAt" IS NOT NULL));
ALTER TABLE "DailyBrief" ADD CONSTRAINT "DailyBrief_publication_time"
  CHECK ("status" <> 'PUBLISHED' OR ("generatedAt" IS NOT NULL AND "publishedAt" IS NOT NULL));
ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_position" CHECK ("position" >= 0);
ALTER TABLE "BriefItem" ADD CONSTRAINT "BriefItem_importance" CHECK ("importanceScore" BETWEEN 0 AND 100);
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_counts" CHECK ("attempts" >= 0 AND "recordsProcessed" >= 0);
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_times" CHECK ("finishedAt" >= "startedAt");
ALTER TABLE "ProviderStatus" ADD CONSTRAINT "ProviderStatus_latency" CHECK ("latencyMs" >= 0);
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fee" CHECK ("fee" >= 0 AND (("fee" IS NULL) = ("currency" IS NULL)));
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_contract" CHECK ("contractEndsAt" >= "contractStartsAt");
ALTER TABLE "ClaimEvidence" ADD CONSTRAINT "ClaimEvidence_one_source"
  CHECK (num_nonnulls("sourceArticleId", "matchId") = 1
    AND ("matchId" IS NULL OR ("fieldPath" IS NOT NULL AND btrim("fieldPath") <> '')));

-- PostgreSQL 16: NULL player IDs still identify one club-level metric.
CREATE UNIQUE INDEX "MatchStat_identity_key" ON "MatchStat"
  ("matchId", "clubId", "playerId", "provider", "metric", "period") NULLS NOT DISTINCT;

-- Basic evidence integrity, not the complete editorial publication gate (M7/M12).
-- Deferred checks allow evidence and content to be written in a single transaction.
CREATE FUNCTION check_article_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject uuid;
BEGIN
  IF TG_TABLE_NAME = 'Article' THEN
    subject := NEW."id";
  ELSE
    subject := OLD."articleId";
  END IF;
  IF EXISTS (SELECT 1 FROM "Article" WHERE "id" = subject AND "publicationStatus" = 'PUBLISHED')
     AND NOT EXISTS (SELECT 1 FROM "ClaimEvidence" WHERE "articleId" = subject) THEN
    RAISE EXCEPTION 'Published article requires claim evidence' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "Article_requires_evidence" AFTER INSERT OR UPDATE ON "Article"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_article_evidence();
CREATE CONSTRAINT TRIGGER "Article_preserve_evidence" AFTER DELETE OR UPDATE ON "ClaimEvidence"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_article_evidence();

CREATE FUNCTION assert_brief_evidence(subject uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "BriefRevision" WHERE "id" = subject AND "status" IN ('READY', 'PUBLISHED'))
     AND (NOT EXISTS (SELECT 1 FROM "BriefItem" WHERE "revisionId" = subject)
       OR EXISTS (SELECT 1 FROM "BriefItem" i WHERE i."revisionId" = subject
         AND NOT EXISTS (SELECT 1 FROM "BriefItemEvidence" e WHERE e."briefItemId" = i."id"))) THEN
    RAISE EXCEPTION 'Ready/published brief requires nonempty evidenced items' USING ERRCODE = '23514';
  END IF;
END $$;
CREATE FUNCTION check_brief_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject uuid;
BEGIN
  IF TG_TABLE_NAME = 'BriefRevision' THEN
    PERFORM assert_brief_evidence(NEW."id");
  ELSIF TG_TABLE_NAME = 'BriefItem' THEN
    IF TG_OP <> 'INSERT' THEN PERFORM assert_brief_evidence(OLD."revisionId"); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM assert_brief_evidence(NEW."revisionId"); END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT "revisionId" INTO subject FROM "BriefItem" WHERE "id" = OLD."briefItemId";
      PERFORM assert_brief_evidence(subject);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT "revisionId" INTO subject FROM "BriefItem" WHERE "id" = NEW."briefItemId";
      PERFORM assert_brief_evidence(subject);
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "BriefRevision_requires_evidence" AFTER INSERT OR UPDATE ON "BriefRevision"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_brief_evidence();
CREATE CONSTRAINT TRIGGER "BriefItem_preserve_evidence" AFTER INSERT OR UPDATE OR DELETE ON "BriefItem"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_brief_evidence();
CREATE CONSTRAINT TRIGGER "BriefItemEvidence_preserve_evidence" AFTER INSERT OR UPDATE OR DELETE ON "BriefItemEvidence"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_brief_evidence();

-- Content corrections create a new revision. Existing published snapshots cannot change.
CREATE FUNCTION protect_published_brief() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject uuid;
BEGIN
  IF TG_TABLE_NAME = 'BriefRevision' THEN
    IF OLD."status" = 'PUBLISHED' THEN
      RAISE EXCEPTION 'Published brief revision is immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'BriefItem' THEN
      IF TG_OP <> 'DELETE' THEN subject := NEW."revisionId"; END IF;
      IF EXISTS (SELECT 1 FROM "BriefRevision" WHERE "id" = subject AND "status" = 'PUBLISHED') THEN
        RAISE EXCEPTION 'Published brief items are immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_OP <> 'INSERT' THEN subject := OLD."revisionId"; END IF;
    ELSE
      IF TG_OP <> 'DELETE' THEN
        SELECT "revisionId" INTO subject FROM "BriefItem" WHERE "id" = NEW."briefItemId";
      END IF;
      IF EXISTS (SELECT 1 FROM "BriefRevision" WHERE "id" = subject AND "status" = 'PUBLISHED') THEN
        RAISE EXCEPTION 'Published brief citations are immutable' USING ERRCODE = '23514';
      END IF;
      IF TG_OP <> 'INSERT' THEN
        SELECT "revisionId" INTO subject FROM "BriefItem" WHERE "id" = OLD."briefItemId";
      END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM "BriefRevision" WHERE "id" = subject AND "status" = 'PUBLISHED') THEN
      RAISE EXCEPTION 'Published brief content is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "BriefRevision_immutable" BEFORE UPDATE OR DELETE ON "BriefRevision"
  FOR EACH ROW EXECUTE FUNCTION protect_published_brief();
CREATE TRIGGER "BriefItem_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "BriefItem"
  FOR EACH ROW EXECUTE FUNCTION protect_published_brief();
CREATE TRIGGER "BriefItemEvidence_immutable" BEFORE INSERT OR UPDATE OR DELETE ON "BriefItemEvidence"
  FOR EACH ROW EXECUTE FUNCTION protect_published_brief();

-- Audit history is append-only (role/access authorization belongs to later milestones).
CREATE FUNCTION protect_audit_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER "AdminAuditLog_append_only" BEFORE UPDATE OR DELETE ON "AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION protect_audit_log();

COMMIT;
