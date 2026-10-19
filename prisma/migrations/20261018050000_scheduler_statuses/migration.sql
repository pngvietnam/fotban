-- Additive only: reuse existing logical keys, audit metadata and ownership fields.
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'PARTIAL';
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';
