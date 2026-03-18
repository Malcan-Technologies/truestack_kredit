import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3006";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: appUrl,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: false, // sign-up redirects to /sign-in; user signs in manually
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

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },

  trustedOrigins: [
    appUrl,
    process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4001",
  ],
});

export type Session = typeof auth.$Infer.Session;
