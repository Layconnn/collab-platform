-- Preferences that follow a person to every device (settings PRD, FR-15, FR-16).

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "motion" TEXT NOT NULL DEFAULT 'system',
    "density" TEXT NOT NULL DEFAULT 'comfortable',
    "startPage" TEXT NOT NULL DEFAULT 'home',
    "defaultWorkspaceId" TEXT,
    "lastWorkspaceId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_defaultWorkspaceId_fkey" FOREIGN KEY ("defaultWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_lastWorkspaceId_fkey" FOREIGN KEY ("lastWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Allowed values; Prisma cannot express these.
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_theme_check" CHECK ("theme" IN ('system', 'light', 'dark'));
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_motion_check" CHECK ("motion" IN ('system', 'reduce'));
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_density_check" CHECK ("density" IN ('comfortable', 'compact'));
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_startPage_check" CHECK ("startPage" IN ('home', 'default', 'last'));
