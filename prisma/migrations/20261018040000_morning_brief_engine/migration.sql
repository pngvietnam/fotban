-- Frozen generation inputs/configuration, leaving all earlier revision rows untouched.
ALTER TABLE "BriefRevision" ADD COLUMN "generationMetadata" JSONB;
ALTER TABLE "BriefRevision" ADD CONSTRAINT "BriefRevision_metadata_object" CHECK ("generationMetadata" IS NULL OR jsonb_typeof("generationMetadata")='object');
CREATE FUNCTION protect_ready_brief_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject uuid;
BEGIN
  IF TG_TABLE_NAME='BriefRevision' THEN
    IF OLD."generationMetadata" IS NOT NULL AND OLD.status IN ('READY','PUBLISHED') THEN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Managed ready brief is immutable' USING ERRCODE='23514'; END IF;
      IF (to_jsonb(NEW)-'status'-'publishedAt'-'updatedAt') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'publishedAt'-'updatedAt')
         OR NEW.status NOT IN ('READY','PUBLISHED') THEN
        RAISE EXCEPTION 'Managed ready brief content is immutable' USING ERRCODE='23514';
      END IF;
    END IF;
  ELSE
    IF TG_TABLE_NAME='BriefItem' THEN
      IF TG_OP<>'DELETE' THEN subject:=NEW."revisionId"; END IF;
      IF EXISTS(SELECT 1 FROM "BriefRevision" WHERE id=subject AND "generationMetadata" IS NOT NULL AND status IN ('READY','PUBLISHED')) THEN RAISE EXCEPTION 'Managed ready item is immutable' USING ERRCODE='23514'; END IF;
      IF TG_OP<>'INSERT' THEN subject:=OLD."revisionId"; END IF;
    ELSE
      IF TG_OP<>'DELETE' THEN SELECT "revisionId" INTO subject FROM "BriefItem" WHERE id=NEW."briefItemId"; END IF;
      IF EXISTS(SELECT 1 FROM "BriefRevision" WHERE id=subject AND "generationMetadata" IS NOT NULL AND status IN ('READY','PUBLISHED')) THEN RAISE EXCEPTION 'Managed ready citation is immutable' USING ERRCODE='23514'; END IF;
      IF TG_OP<>'INSERT' THEN SELECT "revisionId" INTO subject FROM "BriefItem" WHERE id=OLD."briefItemId"; END IF;
    END IF;
    IF EXISTS(SELECT 1 FROM "BriefRevision" WHERE id=subject AND "generationMetadata" IS NOT NULL AND status IN ('READY','PUBLISHED')) THEN RAISE EXCEPTION 'Managed ready content is immutable' USING ERRCODE='23514'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER "BriefRevision_ready_snapshot" BEFORE UPDATE OR DELETE ON "BriefRevision" FOR EACH ROW EXECUTE FUNCTION protect_ready_brief_snapshot();
CREATE TRIGGER "BriefItem_ready_snapshot" BEFORE INSERT OR UPDATE OR DELETE ON "BriefItem" FOR EACH ROW EXECUTE FUNCTION protect_ready_brief_snapshot();
CREATE TRIGGER "BriefItemEvidence_ready_snapshot" BEFORE INSERT OR UPDATE OR DELETE ON "BriefItemEvidence" FOR EACH ROW EXECUTE FUNCTION protect_ready_brief_snapshot();
