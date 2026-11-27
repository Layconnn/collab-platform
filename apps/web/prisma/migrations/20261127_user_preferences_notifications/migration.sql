-- Notification preferences (settings PRD, FR-4 to FR-7).

-- CreateEnum
CREATE TYPE "NotificationLevel" AS ENUM ('ALL', 'INVOLVED', 'NONE');

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "digestHour" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "mutedKinds" "NotificationType"[] DEFAULT ARRAY[]::"NotificationType"[],
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "WorkspaceNotificationLevel" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "NotificationLevel" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceNotificationLevel_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateIndex
CREATE INDEX "WorkspaceNotificationLevel_userId_idx" ON "WorkspaceNotificationLevel"("userId");

-- AddForeignKey
ALTER TABLE "WorkspaceNotificationLevel" ADD CONSTRAINT "WorkspaceNotificationLevel_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "WorkspaceMember"("workspaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- The digest hour is an hour of the day; Prisma cannot express this.
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_digestHour_check" CHECK ("digestHour" BETWEEN 0 AND 23);
