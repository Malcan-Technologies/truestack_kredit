import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  
  // Enable email/password authentication
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Auto sign in after registration
    autoSignIn: true,
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
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },
  
  // Trusting host headers (for reverse proxy setups)
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  ],
});

// Export type for session
export type Session = typeof auth.$Infer.Session;
