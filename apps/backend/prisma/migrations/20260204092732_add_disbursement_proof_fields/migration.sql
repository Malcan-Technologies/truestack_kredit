-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "disbursementProofAt" TIMESTAMP(3),
ADD COLUMN     "disbursementProofMime" TEXT,
ADD COLUMN     "disbursementProofName" TEXT,
ADD COLUMN     "disbursementProofPath" TEXT,
ADD COLUMN     "disbursementProofSize" INTEGER,
ADD COLUMN     "disbursementReference" TEXT,
ADD COLUMN     "dischargeLetterGenAt" TIMESTAMP(3),
ADD COLUMN     "dischargeLetterPath" TEXT;
