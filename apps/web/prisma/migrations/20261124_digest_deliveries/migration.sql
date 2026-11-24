-- CreateEnum
CREATE TYPE "DigestDeliveryStatus" AS ENUM ('SENDING', 'SENT', 'SKIPPED_EMPTY', 'SKIPPED_OFF', 'HELD', 'FAILED');

-- CreateTable
CREATE TABLE "DigestDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digestDate" DATE NOT NULL,
    "status" "DigestDeliveryStatus" NOT NULL,
    "providerId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DigestDelivery_digestDate_status_idx" ON "DigestDelivery"("digestDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DigestDelivery_userId_digestDate_key" ON "DigestDelivery"("userId", "digestDate");

-- AddForeignKey
ALTER TABLE "DigestDelivery" ADD CONSTRAINT "DigestDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
