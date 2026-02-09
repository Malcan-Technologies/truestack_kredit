import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

const REFERRAL_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += REFERRAL_CHARS[Math.floor(Math.random() * REFERRAL_CHARS.length)];
  }
  return code;
}

async function ensureReferralCode(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (user?.referralCode) return;
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateReferralCode();
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
      return;
    } catch (err: unknown) {
      const isConflict =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002";
      if (!isConflict || attempt === maxAttempts - 1) throw err;
    }
  }
}

const registerSchema = z.object({
  tenantName: z.string().min(2).max(100),
  tenantSlug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  tenantType: z.enum(["PPW", "PPG"], { required_error: "License type is required" }),
  licenseNumber: z.string().min(1).max(50),
  registrationNumber: z.string().min(1).max(50),
  tenantEmail: z.string().email(),
  contactNumber: z.string().min(1).max(20),
  businessAddress: z.string().min(1).max(500),
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100).optional(),
  referralCode: z.string().max(20).optional().transform((s) => (s && s.trim()) || undefined),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);

    // Check if tenant slug already exists
    const existingTenant = await prisma.tenant.findUnique({
      where: { slug: data.tenantSlug },
    });

    if (existingTenant) {
      return NextResponse.json(
        { error: "Tenant slug already exists" },
        { status: 409 }
      );
    }

    // Check if user email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    // Optional: validate referral code and resolve referrer for referredById
    let referrerId: string | null = null;
    if (data.referralCode) {
      const code = data.referralCode.replace(/^INV-/i, "").trim().toUpperCase().slice(0, 6);
      const referrer = code.length === 6 ? await prisma.user.findFirst({
        where: { referralCode: code },
        select: { id: true },
      }) : null;
      if (!referrer) {
        delete (data as { referralCode?: string }).referralCode;
      } else {
        referrerId = referrer.id;
      }
    }

    // Create tenant in a transaction
    const tenant = await prisma.$transaction(async (tx) => {
      // Create tenant
      const newTenant = await tx.tenant.create({
        data: {
          name: data.tenantName,
          slug: data.tenantSlug,
          type: data.tenantType,
          licenseNumber: data.licenseNumber,
          registrationNumber: data.registrationNumber,
          email: data.tenantEmail,
          contactNumber: data.contactNumber,
          businessAddress: data.businessAddress,
          status: "ACTIVE",
        },
      });

      // Create initial subscription (30 days trial)
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setDate(periodEnd.getDate() + 30);

      await tx.subscription.create({
        data: {
          tenantId: newTenant.id,
          plan: "trial",
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
        },
      });

      return newTenant;
    });

    // Sign up user with Better Auth (this creates the user and credential account)
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        name: data.name || data.email.split("@")[0],
      },
    });

    if (!signUpResult || !signUpResult.user) {
      // Rollback tenant creation if user signup fails
      await prisma.tenant.delete({ where: { id: tenant.id } });
      return NextResponse.json(
        { error: "Failed to create user account" },
        { status: 500 }
      );
    }

    // Create membership for the owner
    await prisma.tenantMember.create({
      data: {
        userId: signUpResult.user.id,
        tenantId: tenant.id,
        role: "OWNER",
        isActive: true,
      },
    });

    // Record who referred this user (when valid referral code was used)
    if (referrerId) {
      await prisma.user.update({
        where: { id: signUpResult.user.id },
        data: { referredById: referrerId },
      });

      // Create Referral record when valid referral code was used
      if (data.referralCode) {
        const code = data.referralCode.replace(/^INV-/i, "").trim().toUpperCase().slice(0, 6);
        await prisma.referral.create({
          data: {
            referralCode: code,
            referrerUserId: referrerId,
            referredUserId: signUpResult.user.id,
            rewardAmount: 49900, // RM499 in cents
            isEligible: true,
            eligibleAt: new Date(),
          },
        });
      }
    }

    // Auto-generate referral code for the new user so they always have one
    await ensureReferralCode(signUpResult.user.id);

    // Update the session with active tenant (Better Auth returns token at top level)
    if (signUpResult.token) {
      await prisma.session.update({
        where: { token: signUpResult.token },
        data: { activeTenantId: tenant.id },
      });
    }

    // Return the session with cookies
    const response = NextResponse.json({
      success: true,
      data: {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
        user: {
          id: signUpResult.user.id,
          email: signUpResult.user.email,
          name: signUpResult.user.name,
        },
      },
    });

    // Copy session cookies from Better Auth response if available (headers may exist at runtime)
    const headers = (signUpResult as { headers?: Headers }).headers;
    if (headers) {
      const setCookieHeader = headers.get("set-cookie");
      if (setCookieHeader) {
        response.headers.set("set-cookie", setCookieHeader);
      }
    }

    return response;
  } catch (error) {
    console.error("Registration error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.errors[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
