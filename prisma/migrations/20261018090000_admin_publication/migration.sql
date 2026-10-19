-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "approvalAuditId" UUID;

-- AlterTable
ALTER TABLE "BriefRevision" ADD COLUMN     "publishedById" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "Article_approvalAuditId_key" ON "Article"("approvalAuditId");

-- CreateIndex
CREATE INDEX "BriefRevision_publishedById_idx" ON "BriefRevision"("publishedById");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_approvalAuditId_fkey" FOREIGN KEY ("approvalAuditId") REFERENCES "AdminAuditLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefRevision" ADD CONSTRAINT "BriefRevision_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
