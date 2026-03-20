import express from 'express';
import cors from 'cors';
import path from 'path';
import { config, validateConfig } from './lib/config.js';
import { prisma } from './lib/prisma.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { ensureUploadDir, UPLOAD_DIR } from './lib/upload.js';
import { getFile } from './lib/storage.js';
import { initCronJobs } from './lib/cronJobs.js';

// Import routes
import authRoutes from './modules/auth/routes.js';
import tenantRoutes from './modules/tenants/routes.js';
import billingRoutes from './modules/billing/routes.js';
import borrowerRoutes from './modules/borrowers/routes.js';
import productRoutes from './modules/products/routes.js';
import loanRoutes from './modules/loans/routes.js';
import scheduleRoutes from './modules/schedules/routes.js';
import complianceRoutes from './modules/compliance/routes.js';
import notificationRoutes from './modules/notifications/routes.js';
import docsRoutes from './modules/docs/routes.js';
import referralsRoutes from './modules/referrals/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';
import resendWebhookRoutes from './modules/webhooks/resendWebhook.js';
import trueIdentityWebhookRoutes from './modules/webhooks/trueIdentityWebhook.js';
import trueIdentityPaymentWebhookRoutes from './modules/webhooks/trueIdentityPaymentWebhook.js';
import truestackKycWebhookRoutes from './modules/webhooks/truestackKycWebhook.js';
import kreditReferralPaidWebhookRoutes from './modules/webhooks/kreditReferralPaidWebhook.js';
import kreditSubscriptionPaymentDecisionWebhookRoutes from './modules/webhooks/kreditSubscriptionPaymentDecisionWebhook.js';
import kreditSubscriptionDatesWebhookRoutes from './modules/webhooks/kreditSubscriptionDatesWebhook.js';
import internalAdminRoutes from './modules/internalAdmin/routes.js';
import borrowerAuthRoutes from './modules/borrower-auth/routes.js';

validateConfig();

const app = express();

// Ensure upload directories exist
ensureUploadDir();

// Middleware
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// Webhook routes MUST be registered before express.json() to preserve raw body for signature verification
app.use('/api/webhooks/resend', express.raw({ type: 'application/json' }), resendWebhookRoutes);
app.use('/api/webhooks/kredit/referral-paid', express.raw({ type: 'application/json' }), kreditReferralPaidWebhookRoutes);
app.use('/api/webhooks/kredit/subscription-payment-decision', express.raw({ type: 'application/json' }), kreditSubscriptionPaymentDecisionWebhookRoutes);
app.use('/api/webhooks/kredit/subscription-dates', express.raw({ type: 'application/json' }), kreditSubscriptionDatesWebhookRoutes);
app.use('/api/webhooks/trueidentity/payment', express.raw({ type: 'application/json' }), trueIdentityPaymentWebhookRoutes);
app.use('/api/webhooks/trueidentity', express.raw({ type: 'application/json' }), trueIdentityWebhookRoutes);
app.use('/api/webhooks/truestack-kyc', express.raw({ type: 'application/json' }), truestackKycWebhookRoutes);

app.use(express.json());
app.use(requestLogger);

// Serve uploaded files (in dev; in prod, use S3/CDN)
// Mounted on both /uploads and /api/uploads to support direct access and proxy access
if (config.storage.type === 'local') {
  app.use('/uploads', express.static(UPLOAD_DIR));
  app.use('/api/uploads', express.static(UPLOAD_DIR));
} else {
  app.get(/^\/(?:api\/)?uploads\/(.+)$/, async (req, res, next) => {
    try {
      const normalizedPath = req.path.startsWith('/api/uploads/')
        ? req.path.replace('/api/uploads/', '/uploads/')
        : req.path;

      const fileBuffer = await getFile(normalizedPath);
      if (!fileBuffer) {
        res.status(404).json({ success: false, error: 'File not found' });
        return;
      }

      const extension = path.extname(normalizedPath).toLowerCase();
      const contentTypeByExt: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.pdf': 'application/pdf',
      };
      const contentType = contentTypeByExt[extension] || 'application/octet-stream';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    } catch (error) {
      next(error);
    }
  });
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/borrowers', borrowerRoutes);
app.use('/api/products', productRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/internal/kredit/admin', internalAdminRoutes);
app.use('/api/borrower-auth', borrowerAuthRoutes);

// Error handling
app.use(errorHandler);

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
app.listen(config.port, () => {
  console.log(`🚀 TrueKredit API running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);

  // Initialize cron jobs after server starts
  initCronJobs();
});
