import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
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
  
  // Secret for verifying signed cookies (must match frontend)
  secret: process.env.BETTER_AUTH_SECRET,
  
  // Base URL - this is the frontend URL since that's where auth routes are
  baseURL: process.env.FRONTEND_URL || "http://localhost:3006",
  
  // Session configuration (should match frontend)
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // Update session every 24 hours
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  
  // Advanced settings for cookie verification
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
});
