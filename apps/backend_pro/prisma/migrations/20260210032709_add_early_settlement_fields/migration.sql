-- AlterEnum
ALTER TYPE "RepaymentStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "earlySettlementAmount" DECIMAL(12,2),
ADD COLUMN     "earlySettlementDate" TIMESTAMP(3),
ADD COLUMN     "earlySettlementDiscount" DECIMAL(12,2),
ADD COLUMN     "earlySettlementNotes" TEXT,
ADD COLUMN     "earlySettlementWaiveLateFees" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PaymentTransaction" ADD COLUMN     "paymentType" TEXT NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "earlySettlementDiscountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
ADD COLUMN     "earlySettlementDiscountValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "earlySettlementEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "earlySettlementLockInMonths" INTEGER NOT NULL DEFAULT 0;
