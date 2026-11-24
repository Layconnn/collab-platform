-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "discussionId" TEXT,
    "commentId" TEXT,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reaction_workspaceId_discussionId_idx" ON "Reaction"("workspaceId", "discussionId");

-- CreateIndex
CREATE INDEX "Reaction_commentId_idx" ON "Reaction"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_discussionId_userId_emoji_key" ON "Reaction"("discussionId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_commentId_userId_emoji_key" ON "Reaction"("commentId", "userId", "emoji");

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: a reaction belongs to exactly one discussion or reply, and the
-- emoji is one of the eight the product offers (see the Reaction model).
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_one_subject_check"
  CHECK (("discussionId" IS NULL) <> ("commentId" IS NULL));
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_emoji_check"
  CHECK ("emoji" IN ('👍', '❤️', '🎉', '😄', '🤔', '👀', '🚀', '✅'));
