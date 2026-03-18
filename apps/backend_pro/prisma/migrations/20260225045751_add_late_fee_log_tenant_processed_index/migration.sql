-- CreateIndex
CREATE INDEX "LateFeeProcessingLog_tenantId_processedAt_idx" ON "LateFeeProcessingLog"("tenantId", "processedAt");
