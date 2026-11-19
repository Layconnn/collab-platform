-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PROPOSED', 'DECIDED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DecisionRevisionAction" AS ENUM ('CREATE', 'EDIT', 'FINALIZE', 'SUPERSEDE', 'SOFT_DELETE');

-- DropIndex
DROP INDEX "Discussion_workspaceId_id_idx";

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceWorkspaceId" TEXT,
    "sourceDiscussionId" TEXT,
    "sourceDiscussionTitle" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByLabel" TEXT NOT NULL,
    "deletedById" TEXT,
    "question" TEXT NOT NULL,
    "outcome" TEXT,
    "rationale" TEXT,
    "alternatives" TEXT,
    "followUp" TEXT,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionRevision" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" "DecisionRevisionAction" NOT NULL,
    "actorUserId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "reason" TEXT,
    "question" TEXT NOT NULL,
    "outcome" TEXT,
    "rationale" TEXT,
    "alternatives" TEXT,
    "followUp" TEXT,
    "status" "DecisionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionSupersession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "previousDecisionId" TEXT NOT NULL,
    "replacementDecisionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authorizedById" TEXT,
    "authorizedByLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionSupersession_pkey" PRIMARY KEY ("id")
);

-- Prisma cannot represent these CHECK constraints in schema.prisma.
-- Both nullable source columns must detach together, and a live source must
-- belong to the decision's required workspace. The composite FK below then
-- verifies that the discussion exists in that workspace.
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_source_scope_check" CHECK (
    ("sourceWorkspaceId" IS NULL AND "sourceDiscussionId" IS NULL)
    OR ("sourceWorkspaceId" IS NOT NULL AND "sourceDiscussionId" IS NOT NULL AND "sourceWorkspaceId" = "workspaceId")
);

ALTER TABLE "Decision" ADD CONSTRAINT "Decision_version_positive_check" CHECK ("version" >= 1);
ALTER TABLE "DecisionRevision" ADD CONSTRAINT "DecisionRevision_version_positive_check" CHECK ("version" >= 1);
ALTER TABLE "DecisionSupersession" ADD CONSTRAINT "DecisionSupersession_distinct_check" CHECK ("previousDecisionId" <> "replacementDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_idempotencyKey_key" ON "Decision"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Decision_workspaceId_status_id_idx" ON "Decision"("workspaceId", "status", "id" DESC);

-- CreateIndex
CREATE INDEX "Decision_sourceWorkspaceId_sourceDiscussionId_idx" ON "Decision"("sourceWorkspaceId", "sourceDiscussionId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_workspaceId_id_key" ON "Decision"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRevision_decisionId_version_key" ON "DecisionRevision"("decisionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionSupersession_workspaceId_previousDecisionId_key" ON "DecisionSupersession"("workspaceId", "previousDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionSupersession_workspaceId_replacementDecisionId_key" ON "DecisionSupersession"("workspaceId", "replacementDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Discussion_workspaceId_id_key" ON "Discussion"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_sourceWorkspaceId_sourceDiscussionId_fkey" FOREIGN KEY ("sourceWorkspaceId", "sourceDiscussionId") REFERENCES "Discussion"("workspaceId", "id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRevision" ADD CONSTRAINT "DecisionRevision_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "Decision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRevision" ADD CONSTRAINT "DecisionRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionSupersession" ADD CONSTRAINT "DecisionSupersession_workspaceId_previousDecisionId_fkey" FOREIGN KEY ("workspaceId", "previousDecisionId") REFERENCES "Decision"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionSupersession" ADD CONSTRAINT "DecisionSupersession_workspaceId_replacementDecisionId_fkey" FOREIGN KEY ("workspaceId", "replacementDecisionId") REFERENCES "Decision"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionSupersession" ADD CONSTRAINT "DecisionSupersession_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Owner deletion can reach these rows by both User SET NULL and Workspace
-- CASCADE paths. PostgreSQL still performs those actions immediately; only
-- the child-side FK checks wait until transaction end, when the cascaded rows
-- are gone. Prisma cannot represent constraint deferrability in schema.prisma.
ALTER TABLE "DecisionRevision" ALTER CONSTRAINT "DecisionRevision_decisionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DecisionSupersession" ALTER CONSTRAINT "DecisionSupersession_workspaceId_previousDecisionId_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "DecisionSupersession" ALTER CONSTRAINT "DecisionSupersession_workspaceId_replacementDecisionId_fkey" DEFERRABLE INITIALLY DEFERRED;
