BEGIN;

-- The identity must never advertise a published Brief without a published revision.
CREATE FUNCTION check_daily_brief_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "DailyBrief" d WHERE d."id" = NEW."id" AND d."status" = 'PUBLISHED'
    AND NOT EXISTS (SELECT 1 FROM "BriefRevision" r WHERE r."briefId" = d."id" AND r."status" = 'PUBLISHED')) THEN
    RAISE EXCEPTION 'Published brief identity requires a published revision' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "DailyBrief_requires_revision" AFTER INSERT OR UPDATE ON "DailyBrief"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_daily_brief_revision();

-- Preserve citation meaning as well as FK existence. Corrections create new evidence.
CREATE FUNCTION protect_published_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "BriefItemEvidence" e
      JOIN "BriefItem" i ON i."id" = e."briefItemId"
      JOIN "BriefRevision" r ON r."id" = i."revisionId"
      WHERE e."evidenceId" = OLD."id" AND r."status" = 'PUBLISHED') THEN
    RAISE EXCEPTION 'Published brief evidence is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "ClaimEvidence_published_immutable" BEFORE UPDATE ON "ClaimEvidence"
  FOR EACH ROW EXECUTE FUNCTION protect_published_evidence();

COMMIT;
