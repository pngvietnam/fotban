-- Allow attribution only in the existing one-way READY -> PUBLISHED transition.
ALTER TABLE "BriefRevision" ADD CONSTRAINT "BriefRevision_publisher_state"
  CHECK ("publishedById" IS NULL OR status='PUBLISHED');
CREATE OR REPLACE FUNCTION protect_ready_brief_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE subject uuid;
BEGIN
  IF TG_TABLE_NAME='BriefRevision' THEN
    IF NEW."publishedById" IS DISTINCT FROM OLD."publishedById"
       AND NOT (TG_OP='UPDATE' AND OLD.status='READY' AND NEW.status='PUBLISHED' AND OLD."publishedById" IS NULL) THEN
      RAISE EXCEPTION 'Publisher can only be assigned during publication' USING ERRCODE='23514';
    END IF;
    IF OLD."generationMetadata" IS NOT NULL AND OLD.status IN ('READY','PUBLISHED') THEN
      IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Managed ready brief is immutable' USING ERRCODE='23514'; END IF;
      IF (to_jsonb(NEW)-'status'-'publishedAt'-'updatedAt'-'publishedById') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'publishedAt'-'updatedAt'-'publishedById')
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
