-- AlterTable
ALTER TABLE "TenantAddOn" ADD COLUMN     "settings" JSONB;

-- CreateTable
CREATE TABLE "LatePaymentNoticeDispatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loanId" TEXT NOT NULL,
    "noticeType" TEXT NOT NULL,
    "noticeDateMYT" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LatePaymentNoticeDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LatePaymentNoticeDispatch_tenantId_noticeDateMYT_idx" ON "LatePaymentNoticeDispatch"("tenantId", "noticeDateMYT");

-- CreateIndex
CREATE INDEX "LatePaymentNoticeDispatch_loanId_idx" ON "LatePaymentNoticeDispatch"("loanId");

-- CreateIndex
CREATE UNIQUE INDEX "LatePaymentNoticeDispatch_tenantId_loanId_noticeType_notice_key" ON "LatePaymentNoticeDispatch"("tenantId", "loanId", "noticeType", "noticeDateMYT");
