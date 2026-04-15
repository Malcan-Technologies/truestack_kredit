-- CreateTable
CREATE TABLE "TenantNotificationSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedByMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantNotificationSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BorrowerNotification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "notificationKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorrowerNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BorrowerNotificationDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "borrowerId" TEXT,
    "borrowerNotificationId" TEXT,
    "channel" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "tokenSnapshot" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorrowerNotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BorrowerPushDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "borrowerId" TEXT NOT NULL,
    "userId" TEXT,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'expo',
    "appId" TEXT,
    "deviceName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BorrowerPushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deepLink" TEXT,
    "audienceType" TEXT NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdByMemberId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantNotificationSetting_tenantId_notificationKey_idx" ON "TenantNotificationSetting"("tenantId", "notificationKey");

-- CreateIndex
CREATE UNIQUE INDEX "TenantNotificationSetting_tenantId_notificationKey_channel_key" ON "TenantNotificationSetting"("tenantId", "notificationKey", "channel");

-- CreateIndex
CREATE INDEX "BorrowerNotification_tenantId_borrowerId_createdAt_idx" ON "BorrowerNotification"("tenantId", "borrowerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BorrowerNotification_tenantId_sourceType_sourceId_idx" ON "BorrowerNotification"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "BorrowerNotification_borrowerId_readAt_idx" ON "BorrowerNotification"("borrowerId", "readAt");

-- CreateIndex
CREATE INDEX "BorrowerNotificationDelivery_tenantId_channel_status_create_idx" ON "BorrowerNotificationDelivery"("tenantId", "channel", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BorrowerNotificationDelivery_borrowerNotificationId_idx" ON "BorrowerNotificationDelivery"("borrowerNotificationId");

-- CreateIndex
CREATE INDEX "BorrowerNotificationDelivery_borrowerId_createdAt_idx" ON "BorrowerNotificationDelivery"("borrowerId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "BorrowerPushDevice_token_key" ON "BorrowerPushDevice"("token");

-- CreateIndex
CREATE INDEX "BorrowerPushDevice_tenantId_borrowerId_idx" ON "BorrowerPushDevice"("tenantId", "borrowerId");

-- CreateIndex
CREATE INDEX "BorrowerPushDevice_tenantId_isActive_idx" ON "BorrowerPushDevice"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "BorrowerPushDevice_borrowerId_isActive_idx" ON "BorrowerPushDevice"("borrowerId", "isActive");

-- CreateIndex
CREATE INDEX "NotificationCampaign_tenantId_status_createdAt_idx" ON "NotificationCampaign"("tenantId", "status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "TenantNotificationSetting" ADD CONSTRAINT "TenantNotificationSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerNotification" ADD CONSTRAINT "BorrowerNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerNotification" ADD CONSTRAINT "BorrowerNotification_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerNotificationDelivery" ADD CONSTRAINT "BorrowerNotificationDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerNotificationDelivery" ADD CONSTRAINT "BorrowerNotificationDelivery_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerNotificationDelivery" ADD CONSTRAINT "BorrowerNotificationDelivery_borrowerNotificationId_fkey" FOREIGN KEY ("borrowerNotificationId") REFERENCES "BorrowerNotification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerPushDevice" ADD CONSTRAINT "BorrowerPushDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerPushDevice" ADD CONSTRAINT "BorrowerPushDevice_borrowerId_fkey" FOREIGN KEY ("borrowerId") REFERENCES "Borrower"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BorrowerPushDevice" ADD CONSTRAINT "BorrowerPushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationCampaign" ADD CONSTRAINT "NotificationCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
