/**
 * Better Auth instance for borrower sign-in/sign-up on the mobile app.
 *
 * This instance mirrors the borrower Next.js auth config (apps/borrower_pro/Demo_Client/lib/auth-server.ts)
 * so that the mobile app can authenticate directly against backend_pro without
 * needing the Next.js web app to be running.
 *
 * Mounted at basePath: '/api/borrower-auth/auth'
 * Sessions are written to the same DB with the same schema as the Next.js borrower
 * auth, so the existing requireBorrowerSession middleware continues to work.
 *
 * Intentionally minimal for v1 mobile: emailAndPassword + twoFactor only.
 * Passkeys and org invitation hooks are handled by their respective routes.
 */

import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { passkey } from '@better-auth/passkey';
import { expo } from '@better-auth/expo';
import {
  AUTH_COOKIE_PREFIXES,
  AUTH_LINK_TOKEN_MAX_AGE_SECONDS,
  TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
  TRUSTED_DEVICE_MAX_AGE_SECONDS,
  collectOrigins,
  getPasskeyRpId,
  splitOrigins,
} from '@kredit/shared';
import { prisma } from './prisma.js';
import { config } from './config.js';

const BORROWER_AUTH_BASE_PATH = '/api/borrower-auth/auth';
const APP_NAME = 'TrueKredit Borrower';

// Backend base URL — used for generating email links.
// Falls back to localhost:4001 for local dev.
const backendBaseUrl = (
  process.env.BACKEND_PRO_PUBLIC_URL ||
  process.env.BACKEND_URL ||
  `http://localhost:${config.port}`
).replace(/\/$/, '');

// Web borrower app URL — used for reset-password / verify-email redirect links
// so that email links open the correct UI.
const borrowerWebUrl = (
  process.env.BORROWER_WEB_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'http://localhost:3006'
).replace(/\/$/, '');

const trustedOrigins = collectOrigins(
  backendBaseUrl,
  borrowerWebUrl,
  splitOrigins(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
  'http://localhost:3006',
  // Expo app scheme for deep-link callbacks and trusted origin on mobile
  'democlient://',
  // Expo Go development scheme
  'exp://',
);
const passkeyOrigins = collectOrigins(
  borrowerWebUrl,
  splitOrigins(process.env.BETTER_AUTH_PASSKEY_ORIGINS),
);
const passkeyRpId =
  process.env.BETTER_AUTH_PASSKEY_RP_ID || getPasskeyRpId(borrowerWebUrl);

/** Minimal Resend email sender — uses the same API key as the rest of backend_pro. */
async function sendResendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  const apiKey = config.notifications.resendApiKey;
  if (!apiKey) {
    console.warn('[borrower-auth] RESEND_API_KEY not set — skipping email send');
    return;
  }
  const fromAddress = config.email.fromAddress;
  const fromName = config.email.fromName;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[borrower-auth] Resend error:', res.status, body);
    }
  } catch (err) {
    console.error('[borrower-auth] Failed to send email:', err);
  }
}

const devSkipSignInEmailVerification =
  process.env.NODE_ENV === 'development' &&
  process.env.BORROWER_AUTH_DEV_SKIP_SIGNIN_EMAIL_VERIFICATION === 'true';

export const borrowerAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: backendBaseUrl,
  basePath: BORROWER_AUTH_BASE_PATH,

  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, token }) => {
      // Verification link opens the borrower web app UI.
      const verifyUrl = `${borrowerWebUrl}/verify-email/confirm?token=${encodeURIComponent(token)}`;
      void sendResendEmail({
        to: user.email,
        subject: 'Verify your TrueKredit Borrower email',
        html: `
          <p>Hi ${user.name ?? 'there'},</p>
          <p>Verify your email address to continue securing your TrueKredit Borrower account.</p>
          <p><a href="${verifyUrl}">Verify email</a></p>
          <p>If you did not create this account, you can ignore this email.</p>
        `,
      });
    },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: false,
    requireEmailVerification: devSkipSignInEmailVerification ? false : true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: AUTH_LINK_TOKEN_MAX_AGE_SECONDS,
    sendResetPassword: async ({ user, token }) => {
      const resetUrl = `${borrowerWebUrl}/reset-password?token=${encodeURIComponent(token)}`;
      void sendResendEmail({
        to: user.email,
        subject: 'Reset your TrueKredit Borrower password',
        html: `
          <p>Hi ${user.name ?? 'there'},</p>
          <p>Use the secure link below to reset your password.</p>
          <p><a href="${resetUrl}">Reset password</a></p>
          <p>This link expires in 15 minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        `,
      });
    },
    onPasswordReset: async ({ user }) => {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordChangedAt: new Date() },
      });
    },
  },

  rateLimit: {
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 300, max: 10 },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
    additionalFields: {
      activeBorrowerId: { type: 'string', required: false },
      activeOrganizationId: { type: 'string', required: false },
      activeTeamId: { type: 'string', required: false },
    },
  },

  user: {
    changeEmail: { enabled: true },
    additionalFields: {
      isActive: { type: 'boolean', required: false, defaultValue: true, input: false },
      passwordChangedAt: { type: 'date', required: false, input: false },
    },
  },

  plugins: [
    expo(),
    twoFactor({
      issuer: APP_NAME,
      twoFactorCookieMaxAge: TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
      trustDeviceMaxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
      totpOptions: { digits: 6, period: 30 },
    }),
    passkey({
      rpID: passkeyRpId,
      origin: passkeyOrigins,
    }),
  ],

  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== '/passkey/verify-registration') {
        return;
      }

      try {
        const returned = ctx.context.returned;
        if (!returned) return;

        let data: Record<string, unknown> | null = null;
        if (returned instanceof Response) {
          if (returned.status === 200) {
            data = (await returned.clone().json()) as Record<string, unknown>;
          }
        } else if (typeof returned === 'object' && !('stack' in (returned as object))) {
          data = returned as Record<string, unknown>;
        }

        const id = data?.id as string | undefined;
        if (!id) return;

        await prisma.passkey.update({
          where: { id },
          data: { rpId: passkeyRpId },
        });
      } catch (error) {
        console.error('[borrower-auth] Failed to stamp rpId on passkey:', error);
      }
    }),
  },

  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIXES.borrower,
    useSecureCookies: process.env.NODE_ENV === 'production',
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
  },

  trustedOrigins,
});
