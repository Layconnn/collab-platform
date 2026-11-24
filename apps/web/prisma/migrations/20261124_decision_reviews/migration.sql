-- CreateEnum
CREATE TYPE "DecisionReviewRule" AS ENUM ('ALL', 'AT_LEAST');

-- CreateEnum
CREATE TYPE "DecisionReviewState" AS ENUM ('PENDING', 'APPROVED', 'OBJECTED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityKind" ADD VALUE 'DECISION_REVIEW_REQUESTED';
ALTER TYPE "ActivityKind" ADD VALUE 'DECISION_REVIEW_RESPONDED';
ALTER TYPE "ActivityKind" ADD VALUE 'DECISION_REVIEW_WITHDRAWN';
ALTER TYPE "ActivityKind" ADD VALUE 'DECISION_REVIEWS_RESET';
ALTER TYPE "ActivityKind" ADD VALUE 'DECISION_REVIEW_RULE_CHANGED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'REVIEW_RESPONDED';

-- AlterTable
ALTER TABLE "Decision" ADD COLUMN     "requiredApprovals" INTEGER,
ADD COLUMN     "reviewRule" "DecisionReviewRule" NOT NULL DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "DecisionRevision" ADD COLUMN     "overrideReason" TEXT;

-- CreateTable
CREATE TABLE "DecisionReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "reviewerLabel" TEXT NOT NULL,
    "requestedById" TEXT,
    "requestedByLabel" TEXT NOT NULL,
    "state" "DecisionReviewState" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "respondedVersion" INTEGER,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DecisionReview_workspaceId_decisionId_idx" ON "DecisionReview"("workspaceId", "decisionId");

-- CreateIndex
CREATE INDEX "DecisionReview_reviewerId_state_idx" ON "DecisionReview"("reviewerId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionReview_decisionId_reviewerId_key" ON "DecisionReview"("decisionId", "reviewerId");

-- AddForeignKey
ALTER TABLE "DecisionReview" ADD CONSTRAINT "DecisionReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionReview" ADD CONSTRAINT "DecisionReview_workspaceId_decisionId_fkey" FOREIGN KEY ("workspaceId", "decisionId") REFERENCES "Decision"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionReview" ADD CONSTRAINT "DecisionReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionReview" ADD CONSTRAINT "DecisionReview_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written constraints Prisma cannot express (see the DecisionReview model):
-- an objection must explain itself, and an "at least N" rule needs N >= 1.
ALTER TABLE "DecisionReview" ADD CONSTRAINT "DecisionReview_objection_note_check"
  CHECK ("state" <> 'OBJECTED' OR ("note" IS NOT NULL AND length(btrim("note")) > 0));
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_requiredApprovals_check"
  CHECK ("requiredApprovals" IS NULL OR "requiredApprovals" >= 1);
