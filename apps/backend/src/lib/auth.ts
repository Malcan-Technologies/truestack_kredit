import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { collectOrigins, resolveAuthBaseUrl, splitOrigins } from "@kredit/shared";
import { prisma } from "./prisma.js";

/**
 * Better Auth instance for the Express backend
 * This is used to verify sessions created by the Next.js frontend
 * 
 * IMPORTANT: The secret must match the frontend's BETTER_AUTH_SECRET
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: resolveAuthBaseUrl(
    process.env.BETTER_AUTH_BASE_URL ??
      process.env.BETTER_AUTH_URL ??
      process.env.FRONTEND_URL,
    "http://localhost:3000"
  ),
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  trustedOrigins: collectOrigins(
    process.env.BETTER_AUTH_BASE_URL ??
      process.env.BETTER_AUTH_URL ??
      process.env.FRONTEND_URL,
    splitOrigins(process.env.BETTER_AUTH_TRUSTED_ORIGINS)
  ),
});
