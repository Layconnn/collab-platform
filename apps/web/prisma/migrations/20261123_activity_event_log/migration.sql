-- Append-only workspace event log (PRD 2026-11-23 search and activity, FR-1 to FR-4).

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('WORKSPACE_CREATED', 'WORKSPACE_UPDATED', 'MEMBER_ADDED', 'MEMBER_ROLE_CHANGED', 'MEMBER_REMOVED', 'OWNERSHIP_TRANSFERRED', 'DISCUSSION_CREATED', 'DISCUSSION_UPDATED', 'DISCUSSION_DELETED', 'COMMENT_CREATED', 'COMMENT_UPDATED', 'COMMENT_DELETED', 'DECISION_PROPOSED', 'DECISION_EDITED', 'DECISION_FINALIZED', 'DECISION_SUPERSEDED', 'DECISION_DELETED');

-- CreateEnum
CREATE TYPE "ActivitySubjectType" AS ENUM ('WORKSPACE', 'MEMBER', 'DISCUSSION', 'COMMENT', 'DECISION');

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "subjectType" "ActivitySubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityEvent_workspaceId_createdAt_id_idx" ON "ActivityEvent"("workspaceId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ActivityEvent_subjectType_subjectId_idx" ON "ActivityEvent"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ActivityEvent_actorUserId_idx" ON "ActivityEvent"("actorUserId");

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

