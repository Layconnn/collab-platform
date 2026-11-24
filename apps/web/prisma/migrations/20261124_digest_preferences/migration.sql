-- CreateTable
CREATE TABLE "DigestPreference" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "DigestWorkspaceOptOut" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigestWorkspaceOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigestWorkspaceOptOut_userId_workspaceId_key" ON "DigestWorkspaceOptOut"("userId", "workspaceId");

-- AddForeignKey
ALTER TABLE "DigestPreference" ADD CONSTRAINT "DigestPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestWorkspaceOptOut" ADD CONSTRAINT "DigestWorkspaceOptOut_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestWorkspaceOptOut" ADD CONSTRAINT "DigestWorkspaceOptOut_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
