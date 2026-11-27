-- Last username change (settings PRD, FR-2).
ALTER TABLE "User" ADD COLUMN     "usernameChangedAt" TIMESTAMP(3);
