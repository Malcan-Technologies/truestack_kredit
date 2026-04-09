import { PrismaClient } from "@prisma/client";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { twoFactor } from "better-auth/plugins/two-factor";
import { organization } from "better-auth/plugins";
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

const BORROWER_ORG_INVITE_EXPIRES_SEC = 60 * 60 * 24 * 7;

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
      activeOrganizationId: { type: "string", required: false },
      activeTeamId: { type: "string", required: false },
    },
  },

  user: {
    changeEmail: {
      enabled: true,
    },
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
    organization({
      allowUserToCreateOrganization: false,
      invitationExpiresIn: BORROWER_ORG_INVITE_EXPIRES_SEC,
      requireEmailVerificationOnInvitation: true,
      sendInvitationEmail: async (data) => {
        const inviteUrl = buildAbsoluteUrl(
          appUrl,
          `/accept-invitation?invitationId=${encodeURIComponent(data.id)}`
        );
        const inviterLabel =
          data.inviter.user?.name?.trim() ||
          data.inviter.user?.email ||
          "A teammate";
        sendAuthEmail({
          to: data.email,
          subject: `Invitation to join ${data.organization.name} on ${APP_NAME}`,
          text: `You have been invited to join ${data.organization.name}.\n\nAccept: ${inviteUrl}\n\nIf you did not expect this, you can ignore this email.`,
          html: `
            <p>Hi,</p>
            <p><strong>${inviterLabel}</strong> invited you to join <strong>${data.organization.name}</strong> on ${APP_NAME}.</p>
            <p><a href="${inviteUrl}">Accept invitation</a></p>
            <p>If you did not expect this, you can ignore this email.</p>
          `,
        });
      },
      schema: {
        invitation: {
          additionalFields: {
            inviteKind: {
              type: "string",
              required: false,
              defaultValue: "email",
              input: false,
            },
          },
        },
      },
      organizationHooks: {
        afterAcceptInvitation: async ({ user, organization }) => {
          const bol = await prisma.borrowerOrganizationLink.findUnique({
            where: { organizationId: organization.id },
          });
          if (!bol) return;
          await prisma.borrowerProfileLink.upsert({
            where: {
              userId_borrowerId: { userId: user.id, borrowerId: bol.borrowerId },
            },
            create: {
              userId: user.id,
              borrowerId: bol.borrowerId,
              tenantId: bol.tenantId,
              borrowerType: "CORPORATE",
            },
            update: {},
          });
          await prisma.session.updateMany({
            where: { userId: user.id, expiresAt: { gt: new Date() } },
            data: {
              activeBorrowerId: bol.borrowerId,
              activeOrganizationId: organization.id,
            },
          });
        },
        afterRemoveMember: async ({ user, organization }) => {
          const bol = await prisma.borrowerOrganizationLink.findUnique({
            where: { organizationId: organization.id },
          });
          if (!bol) return;
          await prisma.borrowerProfileLink.deleteMany({
            where: { userId: user.id, borrowerId: bol.borrowerId },
          });
          const nextLink = await prisma.borrowerProfileLink.findFirst({
            where: { userId: user.id, tenantId: bol.tenantId },
            orderBy: { createdAt: "asc" },
          });
          await prisma.session.updateMany({
            where: {
              userId: user.id,
              OR: [
                { activeBorrowerId: bol.borrowerId },
                { activeOrganizationId: organization.id },
              ],
            },
            data: {
              activeBorrowerId: nextLink?.borrowerId ?? null,
              activeOrganizationId: null,
            },
          });
        },
      },
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
