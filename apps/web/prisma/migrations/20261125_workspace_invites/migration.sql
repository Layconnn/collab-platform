-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'INVITE_ACCEPTED';

-- CreateTable
CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "tokenHash" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "name" TEXT,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInviteUse" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInviteUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_tokenHash_key" ON "WorkspaceInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_workspaceId_createdAt_idx" ON "WorkspaceInvite"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WorkspaceInviteUse_userId_idx" ON "WorkspaceInviteUse"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInviteUse_inviteId_userId_key" ON "WorkspaceInviteUse"("inviteId", "userId");

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInviteUse" ADD CONSTRAINT "WorkspaceInviteUse_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "WorkspaceInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInviteUse" ADD CONSTRAINT "WorkspaceInviteUse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: a link never grants OWNER, and its uses stay within its limit
-- (invite links PRD, FR-1 and FR-8).
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_role_check" CHECK ("role" IN ('MEMBER', 'ADMIN'));
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_uses_check" CHECK (
  "uses" >= 0 AND ("maxUses" IS NULL OR ("maxUses" BETWEEN 1 AND 100 AND "uses" <= "maxUses"))
);
