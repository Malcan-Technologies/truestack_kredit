import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
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
const AUTH_COOKIE_PREFIX = AUTH_COOKIE_PREFIXES.admin;
const APP_NAME = "TrueKredit Pro";
const appUrl = resolveAuthBaseUrl(
  process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL,
  "http://localhost:3005"
);
const trustedOrigins = collectOrigins(
  appUrl,
  process.env.NEXT_PUBLIC_API_URL,
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

// Define permission statements for your application
const statement = {
  // Loan management permissions
  loan: ["create", "read", "update", "delete", "approve", "disburse"],
  // Borrower management
  borrower: ["create", "read", "update", "delete"],
  // Product management
  product: ["create", "read", "update", "delete"],
  // Application management
  application: ["create", "read", "update", "approve", "reject"],
  // User/team management
  user: ["create", "read", "update", "delete", "invite"],
  // Billing
  billing: ["read", "manage"],
  // Settings
  settings: ["read", "update"],
  // Reports
  reports: ["read", "export"],
} as const;

// Create access controller
const ac = createAccessControl(statement);

// Define roles matching your UserRole enum
export const staffRole = ac.newRole({
  loan: ["read"],
  borrower: ["create", "read", "update"],
  product: ["read"],
  application: ["create", "read", "update"],
  user: ["read"],
  billing: ["read"],
  settings: ["read"],
  reports: ["read"],
});

export const adminRole = ac.newRole({
  loan: ["create", "read", "update", "approve", "disburse"],
  borrower: ["create", "read", "update", "delete"],
  product: ["create", "read", "update"],
  application: ["create", "read", "update", "approve", "reject"],
  user: ["create", "read", "update", "invite"],
  billing: ["read", "manage"],
  settings: ["read", "update"],
  reports: ["read", "export"],
});

export const ownerRole = ac.newRole({
  loan: ["create", "read", "update", "delete", "approve", "disburse"],
  borrower: ["create", "read", "update", "delete"],
  product: ["create", "read", "update", "delete"],
  application: ["create", "read", "update", "approve", "reject"],
  user: ["create", "read", "update", "delete", "invite"],
  billing: ["read", "manage"],
  settings: ["read", "update"],
  reports: ["read", "export"],
});

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
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
          <p>This code expires in 15 minutes.</p>
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
      "/sign-in/email": {
        window: 300, // 5 minutes
        max: 10,
      },
    },
  },
  
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
    additionalFields: {
      activeTenantId: {
        type: "string",
        required: false,
      },
    },
  },
  
  user: {
    changeEmail: {
      enabled: true,
    },
    additionalFields: {
      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
      passwordChangedAt: {
        type: "date",
        required: false,
        input: false,
      },
    },
  },
  
  plugins: [
    admin({
      ac,
      roles: {
        owner: ownerRole,
        admin: adminRole,
        staff: staffRole,
      },
      defaultRole: "staff",
    }) as any,
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
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/passkey/verify-registration") {
        try {
          const returned = ctx.context.returned;
          if (!returned) return;
          let data: Record<string, unknown> | null = null;
          if (returned instanceof Response) {
            if (returned.status === 200) {
              data = await returned.clone().json();
            }
          } else if (typeof returned === "object" && !("stack" in (returned as object))) {
            data = returned as Record<string, unknown>;
          }
          const id = data?.id as string | undefined;
          if (id) {
            await prisma.passkey.update({
              where: { id },
              data: { rpId: passkeyRpId },
            });
          }
        } catch (err) {
          console.error("[auth] Failed to stamp rpId on passkey:", err);
        }
      }
    }),
  },

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
