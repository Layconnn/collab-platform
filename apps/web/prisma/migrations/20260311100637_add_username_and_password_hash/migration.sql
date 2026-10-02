-- Existing accounts receive a stable placeholder username. Password login remains unavailable
-- until a password reset or onboarding flow is provided.
ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "username" TEXT;

UPDATE "User"
SET "username" = 'user_' || "id"
WHERE "username" IS NULL;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
