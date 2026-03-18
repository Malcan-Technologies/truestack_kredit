-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "collateralType" TEXT,
ADD COLUMN     "collateralValue" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "LoanApplication" ADD COLUMN     "collateralType" TEXT,
ADD COLUMN     "collateralValue" DECIMAL(12,2);
