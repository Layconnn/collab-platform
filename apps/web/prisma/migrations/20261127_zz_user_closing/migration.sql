-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SecurityEventKind" ADD VALUE 'DATA_EXPORTED';
ALTER TYPE "SecurityEventKind" ADD VALUE 'ACCOUNT_CLOSED';
ALTER TYPE "SecurityEventKind" ADD VALUE 'ACCOUNT_RESTORED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "erasedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_closedAt_idx" ON "User"("closedAt");


-- An erased account was closed first, and keeps no password, photo or
-- authenticator secret.
ALTER TABLE "User" ADD CONSTRAINT "User_erased_was_closed" CHECK ("erasedAt" IS NULL OR "closedAt" IS NOT NULL);
ALTER TABLE "User" ADD CONSTRAINT "User_erased_has_no_secrets" CHECK ("erasedAt" IS NULL OR ("passwordHash" IS NULL AND "avatarKey" IS NULL AND "totpSecret" IS NULL));
