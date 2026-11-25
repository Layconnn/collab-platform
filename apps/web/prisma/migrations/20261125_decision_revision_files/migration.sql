-- AlterTable
ALTER TABLE "DecisionRevision" ADD COLUMN     "fileNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
