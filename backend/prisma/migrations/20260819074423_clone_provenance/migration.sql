-- AlterTable
ALTER TABLE "ComplianceLimit" ADD COLUMN     "copied_from_limit_id" TEXT,
ADD COLUMN     "inherited_from" TEXT;
