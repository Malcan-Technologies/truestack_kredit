import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { sendEmail } from "./sendEmail";

const prisma = new PrismaClient();

const RESET_CODE_EXPIRY_SECONDS = 15 * 60; // 15 minutes
const AUTH_COOKIE_PREFIX = "truestack-admin";

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
  
  // Secret for signing tokens (required in production)
  secret: process.env.BETTER_AUTH_SECRET,
  
  // Base URL for auth endpoints
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005",
  
  // Enable email/password authentication
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Auto sign in after registration
    autoSignIn: true,
    resetPasswordTokenExpiresIn: RESET_CODE_EXPIRY_SECONDS,
    sendResetPassword: async ({ user, token }, _request) => {
      const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
      const emailLower = user.email.toLowerCase();
      const codeHash = crypto
        .createHash("sha256")
        .update(`${emailLower}:${code}`)
        .digest("hex");
      const expiresAt = new Date(Date.now() + RESET_CODE_EXPIRY_SECONDS * 1000);

      await prisma.passwordResetCode.deleteMany({
        where: { email: emailLower, usedAt: null },
      });
      await prisma.passwordResetCode.create({
        data: {
          email: emailLower,
          codeHash,
          betterAuthToken: token,
          expiresAt,
        },
      });
      const result = await sendEmail({
        to: user.email,
        subject: "Reset your TrueKredit password",
        html: `
          <p>Hi ${user.name || "there"},</p>
          <p>Use this code to reset your password:</p>
          <p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p>
          <p>This code expires in 15 minutes.</p>
          <p>If you didn't request this, you can ignore this email.</p>
        `,
      });
      if (!result.ok) {
        console.error("[auth] Password reset email failed:", result.error);
      }
    },
    onPasswordReset: async ({ user }, _request) => {
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordChangedAt: new Date() },
      });
    },
  },

  // Rate limit: global + stricter login (10 attempts per 5 minutes, then cooldown)
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
  
  // Session configuration
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
    // Additional session fields for multi-tenant support
    additionalFields: {
      activeTenantId: {
        type: "string",
        required: false,
      },
    },
  },
  
  // User fields (identity only, membership handled separately)
  user: {
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
  
  // Plugins
  plugins: [
    admin({
      ac,
      roles: {
        owner: ownerRole,
        admin: adminRole,
        staff: staffRole,
      },
      defaultRole: "staff",
    }),
  ],
  
  // Advanced settings for security
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },
  
  // Trusting host headers (for reverse proxy setups)
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005",
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001",
  ],
});

// Export type for session
export type Session = typeof auth.$Infer.Session;
