-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityKind" ADD VALUE 'COMMENT_PINNED';
ALTER TYPE "ActivityKind" ADD VALUE 'COMMENT_UNPINNED';

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedById" TEXT;

-- CreateIndex
CREATE INDEX "Comment_discussionId_pinnedAt_idx" ON "Comment"("discussionId", "pinnedAt");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
