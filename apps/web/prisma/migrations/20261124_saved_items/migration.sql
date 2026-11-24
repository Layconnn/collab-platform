-- CreateTable
CREATE TABLE "SavedItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "discussionId" TEXT,
    "commentId" TEXT,
    "decisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedItem_userId_createdAt_idx" ON "SavedItem"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "SavedItem_userId_workspaceId_idx" ON "SavedItem"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedItem_userId_discussionId_key" ON "SavedItem"("userId", "discussionId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedItem_userId_commentId_key" ON "SavedItem"("userId", "commentId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedItem_userId_decisionId_key" ON "SavedItem"("userId", "decisionId");

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_workspaceId_decisionId_fkey" FOREIGN KEY ("workspaceId", "decisionId") REFERENCES "Decision"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: a saved item points at exactly one discussion, reply or
-- decision (see the SavedItem model).
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_one_target_check"
  CHECK (num_nonnulls("discussionId", "commentId", "decisionId") = 1);
