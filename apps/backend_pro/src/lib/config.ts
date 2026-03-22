// Configuration management for TrueKredit Backend

export const config = {
  // Server
  port: parseInt(process.env.PORT || '4001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // CORS (borrower_pro + admin_pro local dev)
  corsOrigins: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) || [
    'http://localhost:3006',
    'http://localhost:3005',
  ],

  /** `saas` = multi-tenant SaaS behavior; `pro` = single-tenant Pro deployment (public KYC, no TrueStack Admin tenant provisioning for KYC). */
  productMode: (process.env.PRODUCT_MODE || 'saas') as 'saas' | 'pro',

  // Pro: single tenant for borrower self-service (slug or ID)
  proTenantSlug: process.env.PRO_TENANT_SLUG || 'demo-company',
  proTenantId: process.env.PRO_TENANT_ID || undefined,

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

  // TrueIdentity / TrueStack Admin integration (supports both upper and lowercase env names)
  trueIdentity: {
    adminBaseUrl:
      process.env.TRUESTACK_ADMIN_URL ||
      process.env.TRUEIDENTITY_ADMIN_BASE_URL ||
      process.env.trueidentity_admin_base_url ||
      process.env.truestack_admin_url ||
      '',
    kreditWebhookSecret:
      process.env.KREDIT_WEBHOOK_SECRET ||
      process.env.KREDIT_TRUESTACK_WEBHOOK_SECRET ||
      process.env.kredit_webhook_secret ||
      '',
    callbackWebhookSecret:
      process.env.TRUEIDENTITY_WEBHOOK_SECRET ||
      process.env.TRUEIDENTITY_WEBHOOK_SHARED_SECRET ||
      process.env.KREDIT_WEBHOOK_SECRET ||
      process.env.KREDIT_TRUESTACK_WEBHOOK_SECRET ||
      process.env.trueidentity_webhook_secret ||
      '',
    kreditInternalSecret:
      process.env.KREDIT_INTERNAL_SECRET ||
      process.env.INTERNAL_API_KEY ||
      process.env.kredit_internal_secret ||
      '',
    timestampMaxAgeMs: parseInt(process.env.TRUEIDENTITY_TIMESTAMP_MAX_AGE_MS || '300000', 10),
  },

  /** Public TrueStack KYC API (Bearer key) — separate from TrueKredit↔Admin TrueIdentity webhooks */
  truestackKyc: {
    apiBaseUrl: (process.env.TRUESTACK_KYC_API_BASE_URL || 'https://api.truestack.my').replace(/\/$/, ''),
    apiKey: (process.env.TRUESTACK_KYC_API_KEY || '').trim(),
    /** Public origin where TrueStack POSTs webhooks (must be full https URL in practice, e.g. ngrok) */
    publicWebhookBaseUrl: (process.env.TRUESTACK_KYC_PUBLIC_WEBHOOK_BASE_URL || '')
      .trim()
      .replace(/\/$/, ''),
    redirectUrl: (() => {
      const r = (process.env.TRUESTACK_KYC_REDIRECT_URL || '').trim();
      if (!r) return undefined;
      try {
        const u = new URL(r);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
        return r;
      } catch {
        return undefined;
      }
    })(),
    webhookSecret: (process.env.TRUESTACK_KYC_WEBHOOK_SECRET || '').trim(),
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

  if (config.storage.type !== 's3') {
    throw new Error('FATAL: STORAGE_TYPE must be set to "s3" in production');
  }

  if (!process.env.S3_BUCKET) {
    throw new Error('FATAL: S3_BUCKET must be set in production');
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

  if (process.env.RESEND_API_KEY && !config.notifications.resendWebhookSecret) {
    throw new Error('FATAL: RESEND_WEBHOOK_SECRET must be set in production when RESEND_API_KEY is configured');
  }
}
