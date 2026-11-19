-- Creation retries must remain comparable after a source discussion is deleted
-- and its nullable reference has been detached by the database.
ALTER TABLE "Decision" ADD COLUMN "creationPayloadHash" TEXT;
