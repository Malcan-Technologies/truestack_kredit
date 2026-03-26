-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "agreementFilename" TEXT,
ADD COLUMN     "agreementMimeType" TEXT,
ADD COLUMN     "agreementOriginalName" TEXT,
ADD COLUMN     "agreementPath" TEXT,
ADD COLUMN     "agreementSize" INTEGER,
ADD COLUMN     "agreementUploadedAt" TIMESTAMP(3),
ADD COLUMN     "agreementVersion" INTEGER NOT NULL DEFAULT 0;
