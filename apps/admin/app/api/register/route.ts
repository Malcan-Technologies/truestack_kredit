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
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100).optional(),
  referralCode: z.string().max(20).optional().transform((s) => (s && s.trim()) || undefined),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);

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
      if (referrer) {
        referrerId = referrer.id;
      }
    }

    // Sign up user with Better Auth (this creates the user and credential account)
    const signUpResult = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        name: data.name || data.email.split("@")[0],
      },
    });

    if (!signUpResult || !signUpResult.user) {
      return NextResponse.json(
        { error: "Failed to create user account" },
        { status: 500 }
      );
    }

    // Record who referred this user (when valid referral code was used)
    if (referrerId && data.referralCode) {
      await prisma.user.update({
        where: { id: signUpResult.user.id },
        data: { referredById: referrerId },
      });

      // Create Referral record when valid referral code was used
      const code = data.referralCode.replace(/^INV-/i, "").trim().toUpperCase().slice(0, 6);
      await prisma.referral.create({
        data: {
          referralCode: code,
          referrerUserId: referrerId,
          referredUserId: signUpResult.user.id,
          rewardAmount: 49900, // RM499 in cents
          isEligible: false, // becomes true only after first approved subscription payment
        },
      });
    }

    // Auto-generate referral code for the new user so they always have one
    await ensureReferralCode(signUpResult.user.id);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: signUpResult.user.id,
          email: signUpResult.user.email,
          name: signUpResult.user.name,
        },
        email: signUpResult.user.email,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || "Validation failed" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
