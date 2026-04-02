import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins/two-factor";
import { passkey } from "@better-auth/passkey";
import {
  AUTH_COOKIE_PREFIXES,
  AUTH_LINK_TOKEN_MAX_AGE_SECONDS,
  TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
  TRUSTED_DEVICE_MAX_AGE_SECONDS,
  buildAbsoluteUrl,
  collectOrigins,
  getPasskeyRpId,
  resolveAuthBaseUrl,
  splitOrigins,
} from "@kredit/shared";
import { sendEmail } from "./sendEmail";

const prisma = new PrismaClient();

const APP_NAME = "TrueKredit Borrower";
const appUrl = resolveAuthBaseUrl(
  process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL,
  "http://localhost:3006"
);
const AUTH_COOKIE_PREFIX = AUTH_COOKIE_PREFIXES.borrower;
const trustedOrigins = collectOrigins(
  appUrl,
  process.env.NEXT_PUBLIC_BACKEND_URL,
  splitOrigins(process.env.BETTER_AUTH_TRUSTED_ORIGINS)
);
const passkeyOrigins = collectOrigins(
  appUrl,
  splitOrigins(process.env.BETTER_AUTH_PASSKEY_ORIGINS)
);
const passkeyRpId = process.env.BETTER_AUTH_PASSKEY_RP_ID || getPasskeyRpId(appUrl);

function sendAuthEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  void sendEmail(params).then((result) => {
    if (!result.ok) {
      console.error(`[auth] Failed to send "${params.subject}" email:`, result.error);
    }
  });
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: appUrl,
  appName: APP_NAME,
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    sendVerificationEmail: async ({ user, token }) => {
      const verifyUrl = buildAbsoluteUrl(
        appUrl,
        `/verify-email/confirm?token=${encodeURIComponent(token)}`
      );
      sendAuthEmail({
        to: user.email,
        subject: `Verify your ${APP_NAME} email`,
        text: `Verify your email address by opening this link: ${verifyUrl}`,
        html: `
          <p>Hi ${user.name || "there"},</p>
          <p>Verify your email address to continue securing your ${APP_NAME} account.</p>
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
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: AUTH_LINK_TOKEN_MAX_AGE_SECONDS,
    sendResetPassword: async ({ user, token }) => {
      const resetUrl = buildAbsoluteUrl(
        appUrl,
        `/reset-password?token=${encodeURIComponent(token)}`
      );
      sendAuthEmail({
        to: user.email,
        subject: `Reset your ${APP_NAME} password`,
        text: `Reset your password by opening this link: ${resetUrl}`,
        html: `
          <p>Hi ${user.name || "there"},</p>
          <p>Use the secure link below to reset your password.</p>
          <p><a href="${resetUrl}">Reset password</a></p>
          <p>This link expires in 15 minutes.</p>
          <p>If you didn't request this, you can ignore this email.</p>
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
      "/sign-in/email": { window: 300, max: 10 },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
    additionalFields: {
      activeBorrowerId: { type: "string", required: false },
    },
  },

  user: {
    additionalFields: {
      isActive: { type: "boolean", required: false, defaultValue: true, input: false },
      passwordChangedAt: { type: "date", required: false, input: false },
    },
  },

  plugins: [
    twoFactor({
      issuer: APP_NAME,
      twoFactorCookieMaxAge: TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
      trustDeviceMaxAge: TRUSTED_DEVICE_MAX_AGE_SECONDS,
      totpOptions: {
        digits: 6,
        period: 30,
      },
      backupCodeOptions: {
        amount: 10,
        length: 10,
      },
    }),
    passkey({
      rpID: passkeyRpId,
      origin: passkeyOrigins,
    }),
  ],

  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },

  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;
