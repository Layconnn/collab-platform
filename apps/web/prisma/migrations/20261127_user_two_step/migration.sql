-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SecurityEventKind" ADD VALUE 'TWO_STEP_ENABLED';
ALTER TYPE "SecurityEventKind" ADD VALUE 'TWO_STEP_DISABLED';
ALTER TYPE "SecurityEventKind" ADD VALUE 'RECOVERY_CODES_REGENERATED';
ALTER TYPE "SecurityEventKind" ADD VALUE 'RECOVERY_CODE_USED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryCode_userId_codeHash_key" ON "RecoveryCode"("userId", "codeHash");

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Two-step sign-in is on only with a secret; a step is only kept with one.
ALTER TABLE "User" ADD CONSTRAINT "User_totp_enabled_has_secret" CHECK ("totpEnabledAt" IS NULL OR "totpSecret" IS NOT NULL);
ALTER TABLE "User" ADD CONSTRAINT "User_totp_last_step_positive" CHECK ("totpLastStep" IS NULL OR "totpLastStep" >= 0);
-- A SHA-256 hash, hex.
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_codeHash_format" CHECK ("codeHash" ~ '^[a-f0-9]{64}$');
