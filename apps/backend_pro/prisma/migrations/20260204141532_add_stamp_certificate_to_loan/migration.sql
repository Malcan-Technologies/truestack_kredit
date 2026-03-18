-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "stampCertFilename" TEXT,
ADD COLUMN     "stampCertMimeType" TEXT,
ADD COLUMN     "stampCertOriginalName" TEXT,
ADD COLUMN     "stampCertPath" TEXT,
ADD COLUMN     "stampCertSize" INTEGER,
ADD COLUMN     "stampCertUploadedAt" TIMESTAMP(3),
ADD COLUMN     "stampCertVersion" INTEGER NOT NULL DEFAULT 0;
