import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma.js";

/**
 * Parse comma-separated absolute origins (no trailing slash).
 * Used for Better Auth `trustedOrigins` when multiple frontends share this API.
 */
function splitOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Better Auth on this Express app verifies sessions created by Next.js apps (admin_pro,
 * borrower_pro) that use the same DB + BETTER_AUTH_SECRET.
 *
 * - `baseURL` is a **single** canonical URL Better Auth uses internally (one string).
 * - `trustedOrigins` must list **every** browser origin that signs users in and proxies
 *   cookies to this API — typically admin + borrower (local and production).
 *
 * Env:
 * - BETTER_AUTH_BASE_URL (optional) — canonical base URL; overrides FRONTEND_URL for baseURL.
 * - FRONTEND_URL (optional) — legacy alias for canonical base URL if BETTER_AUTH_BASE_URL unset.
 * - BETTER_AUTH_TRUSTED_ORIGINS — comma-separated list, e.g.
 *   http://localhost:3005,http://localhost:3006
 *   Local defaults below always include :3005 and :3006 so both apps work without setting it.
 */
const explicitTrusted = splitOrigins(process.env.BETTER_AUTH_TRUSTED_ORIGINS);
const baseURL =
  process.env.BETTER_AUTH_BASE_URL ||
  process.env.FRONTEND_URL ||
  explicitTrusted[0] ||
  "http://localhost:3005";

const trustedOrigins = [
  baseURL,
  ...explicitTrusted,
  // Local dev: admin_pro + borrower_pro (Demo_Client) without requiring env
  "http://localhost:3005",
  "http://localhost:3006",
].filter((origin, index, arr) => arr.indexOf(origin) === index);

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  secret: process.env.BETTER_AUTH_SECRET,

  baseURL,

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
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

  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },

  trustedOrigins,
});
