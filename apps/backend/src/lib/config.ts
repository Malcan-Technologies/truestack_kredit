// Configuration management for TrueKredit Backend

export const config = {
  // Server
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // CORS
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  },

  // Storage
  storage: {
    type: process.env.STORAGE_TYPE || 'local',
    path: process.env.STORAGE_PATH || './uploads',
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      accessKey: process.env.S3_ACCESS_KEY,
      secretKey: process.env.S3_SECRET_KEY,
      bucket: process.env.S3_BUCKET || 'kredit-uploads',
    },
  },

  // Billing
  billing: {
    gracePeriodDays: 3,
  },

  // Email
  email: {
    fromName: process.env.EMAIL_FROM_NAME || 'TrueKredit',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'kredit-no-reply@send.truestack.my',
  },

  // Notifications (optional)
  notifications: {
    resendApiKey: process.env.RESEND_API_KEY,
    resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET,
    whatsapp: {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    },
  },

  // Internal domain event webhook signing
  webhook: {
    secret: process.env.WEBHOOK_SECRET || 'dev-webhook-secret',
  },
};

const MIN_SECRET_LENGTH = 32;
const DEV_ACCESS_SECRET = 'dev-secret-change-in-production';
const DEV_REFRESH_SECRET = 'dev-refresh-secret';
const DEV_WEBHOOK_SECRET = 'dev-webhook-secret';

/**
 * Validate environment configuration at startup.
 * Fails fast in production when critical secrets are missing or weak.
 */
export function validateConfig(): void {
  if (config.nodeEnv !== 'production') {
    return;
  }

  const accessSecret = process.env.JWT_SECRET ?? config.jwt.secret;
  const refreshSecret = process.env.JWT_REFRESH_SECRET ?? config.jwt.refreshSecret;
  const webhookSecret = process.env.WEBHOOK_SECRET ?? config.webhook.secret;

  if (!accessSecret || accessSecret === DEV_ACCESS_SECRET || accessSecret.length < MIN_SECRET_LENGTH) {
    throw new Error('FATAL: JWT_SECRET must be set and at least 32 characters in production');
  }

  if (!refreshSecret || refreshSecret === DEV_REFRESH_SECRET || refreshSecret.length < MIN_SECRET_LENGTH) {
    throw new Error('FATAL: JWT_REFRESH_SECRET must be set and at least 32 characters in production');
  }

  if (!webhookSecret || webhookSecret === DEV_WEBHOOK_SECRET || webhookSecret.length < MIN_SECRET_LENGTH) {
    throw new Error('FATAL: WEBHOOK_SECRET must be set and at least 32 characters in production');
  }
}
