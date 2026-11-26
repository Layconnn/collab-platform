-- Edit history on messages (edit history PRD, #200).
-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "editCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Discussion" ADD COLUMN     "editCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DiscussionRevision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "discussionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fileNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editedById" TEXT,
    "editorLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscussionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentRevision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "discussionId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "fileNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "editedById" TEXT,
    "editorLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionRevision_discussionId_version_key" ON "DiscussionRevision"("discussionId", "version");

-- CreateIndex
CREATE INDEX "CommentRevision_workspaceId_discussionId_idx" ON "CommentRevision"("workspaceId", "discussionId");

-- CreateIndex
CREATE UNIQUE INDEX "CommentRevision_commentId_version_key" ON "CommentRevision"("commentId", "version");

-- AddForeignKey
ALTER TABLE "DiscussionRevision" ADD CONSTRAINT "DiscussionRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionRevision" ADD CONSTRAINT "DiscussionRevision_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionRevision" ADD CONSTRAINT "DiscussionRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Constraints Prisma cannot express: versions start at 1 (the original) and
-- edit counts are never negative.
ALTER TABLE "DiscussionRevision" ADD CONSTRAINT "DiscussionRevision_version_check" CHECK ("version" >= 1);
ALTER TABLE "CommentRevision" ADD CONSTRAINT "CommentRevision_version_check" CHECK ("version" >= 1);
ALTER TABLE "Discussion" ADD CONSTRAINT "Discussion_editCount_check" CHECK ("editCount" >= 0);
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_editCount_check" CHECK ("editCount" >= 0);
