-- Add provenance to existing history; legacy rows and all prior data remain untouched.
ALTER TABLE "TransferUpdate" ADD COLUMN "clusterId" UUID, ADD COLUMN "inputHash" TEXT, ADD COLUMN snapshot JSONB;
ALTER TABLE "TransferUpdate" ADD CONSTRAINT "TransferUpdate_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "ArticleCluster"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "TransferUpdate_inputHash_key" ON "TransferUpdate"("inputHash");
CREATE INDEX "TransferUpdate_clusterId_idx" ON "TransferUpdate"("clusterId");
CREATE INDEX "TransferUpdate_transferId_publishedAt_idx" ON "TransferUpdate"("transferId","publishedAt");
ALTER TABLE "TransferUpdate" ADD CONSTRAINT "TransferUpdate_snapshot_shape" CHECK (
  ("inputHash" IS NULL AND snapshot IS NULL AND "clusterId" IS NULL) OR
  ("inputHash" IS NOT NULL AND "clusterId" IS NOT NULL AND snapshot IS NOT NULL AND jsonb_typeof(snapshot)='object')
);
CREATE FUNCTION preserve_transfer_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."inputHash" IS NOT NULL THEN
    RAISE EXCEPTION 'Transfer snapshots are append-only' USING ERRCODE = '23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "TransferUpdate_snapshot_immutable" BEFORE UPDATE OR DELETE ON "TransferUpdate"
  FOR EACH ROW EXECUTE FUNCTION preserve_transfer_snapshot();
