-- CreateEnum
CREATE TYPE "FollowState" AS ENUM ('FOLLOWING', 'MUTED');

-- CreateTable
CREATE TABLE "DiscussionFollow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "discussionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "FollowState" NOT NULL DEFAULT 'FOLLOWING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscussionFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscussionFollow_userId_idx" ON "DiscussionFollow"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscussionFollow_discussionId_userId_key" ON "DiscussionFollow"("discussionId", "userId");

-- AddForeignKey
ALTER TABLE "DiscussionFollow" ADD CONSTRAINT "DiscussionFollow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionFollow" ADD CONSTRAINT "DiscussionFollow_workspaceId_discussionId_fkey" FOREIGN KEY ("workspaceId", "discussionId") REFERENCES "Discussion"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscussionFollow" ADD CONSTRAINT "DiscussionFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (FR-12): existing discussions start with their author and everyone
-- who replied as followers, if they are still members of the workspace.
INSERT INTO "DiscussionFollow" ("id", "workspaceId", "discussionId", "userId", "state", "createdAt", "updatedAt")
SELECT 'f' || md5(p."discussionId" || ':' || p."userId"), p."workspaceId", p."discussionId", p."userId", 'FOLLOWING', now(), now()
FROM (
  SELECT d."workspaceId", d."id" AS "discussionId", d."authorId" AS "userId" FROM "Discussion" d
  UNION
  SELECT c."workspaceId", c."discussionId", c."authorId" FROM "Comment" c
) p
JOIN "WorkspaceMember" m ON m."workspaceId" = p."workspaceId" AND m."userId" = p."userId"
ON CONFLICT ("discussionId", "userId") DO NOTHING;
