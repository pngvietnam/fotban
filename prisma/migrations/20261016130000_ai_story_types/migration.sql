-- Additive only: reuse the existing Article, AIProcessingRun, Quote and evidence models.
ALTER TYPE "StoryType" ADD VALUE IF NOT EXISTS 'COMMUNITY';
ALTER TYPE "StoryType" ADD VALUE IF NOT EXISTS 'OTHER';
