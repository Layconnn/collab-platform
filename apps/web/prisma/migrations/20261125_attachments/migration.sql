-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'ATTACHED');

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "discussionId" TEXT,
    "commentId" TEXT,
    "decisionId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachedAt" TIMESTAMP(3),

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletedFile" (
    "key" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedFile_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_key_key" ON "Attachment"("key");

-- CreateIndex
CREATE INDEX "Attachment_workspaceId_status_idx" ON "Attachment"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Attachment_status_createdAt_idx" ON "Attachment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Attachment_discussionId_position_idx" ON "Attachment"("discussionId", "position");

-- CreateIndex
CREATE INDEX "Attachment_commentId_position_idx" ON "Attachment"("commentId", "position");

-- CreateIndex
CREATE INDEX "Attachment_decisionId_position_idx" ON "Attachment"("decisionId", "position");

-- CreateIndex
CREATE INDEX "DeletedFile_deletedAt_idx" ON "DeletedFile"("deletedAt");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workspaceId_discussionId_fkey" FOREIGN KEY ("workspaceId", "discussionId") REFERENCES "Discussion"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workspaceId_decisionId_fkey" FOREIGN KEY ("workspaceId", "decisionId") REFERENCES "Decision"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: a pending upload belongs to no post; an attached one to exactly
-- one discussion, reply or decision (see the Attachment model).
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_target_check" CHECK (
  ("status" = 'PENDING' AND num_nonnulls("discussionId", "commentId", "decisionId") = 0)
  OR ("status" = 'ATTACHED' AND num_nonnulls("discussionId", "commentId", "decisionId") = 1)
);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_size_check" CHECK ("size" > 0);

-- Hand-written: however an attachment row goes (removed from its post, its
-- post or workspace deleted, an expired pending upload), its storage object is
-- queued for the daily clean-up (file uploads PRD, FR-12).
CREATE FUNCTION "attachment_queue_deleted_file"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "DeletedFile" ("key") VALUES (OLD."key") ON CONFLICT ("key") DO NOTHING;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Attachment_queue_deleted_file"
  AFTER DELETE ON "Attachment"
  FOR EACH ROW EXECUTE FUNCTION "attachment_queue_deleted_file"();
