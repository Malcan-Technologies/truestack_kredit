import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './lib/config.js';
import { prisma } from './lib/prisma.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { ensureUploadDir, UPLOAD_DIR } from './lib/upload.js';
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

const app = express();

// Ensure upload directories exist
ensureUploadDir();

// Middleware
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
app.use(express.json());
app.use(requestLogger);

// Serve uploaded files (in dev; in prod, use S3/CDN)
// Mounted on both /uploads and /api/uploads to support direct access and proxy access
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/api/uploads', express.static(UPLOAD_DIR));

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
