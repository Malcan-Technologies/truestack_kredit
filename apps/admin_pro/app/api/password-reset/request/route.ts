import { auth } from "@/lib/auth-server";
import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const prisma = new PrismaClient();
const MAX_REQUESTS_PER_15MIN = 5;

// Simple in-memory throttle (per-email). For production, use Redis or similar.
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function isThrottled(email: string): boolean {
  const key = email.toLowerCase();
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 min
  const entry = requestCounts.get(key);
  if (!entry) return false;
  if (entry.resetAt < now) {
    requestCounts.delete(key);
    return false;
  }
  return entry.count >= MAX_REQUESTS_PER_15MIN;
}

function recordRequest(email: string): void {
  const key = email.toLowerCase();
  const now = Date.now();
  const resetAt = now + 15 * 60 * 1000;
  const entry = requestCounts.get(key);
  if (!entry) {
    requestCounts.set(key, { count: 1, resetAt });
  } else {
    entry.count += 1;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email) {
      return NextResponse.json(
        { success: true, message: "If an account exists, you will receive a reset code." },
        { status: 200 }
      );
    }

    if (isThrottled(email)) {
      return NextResponse.json(
        { success: true, message: "If an account exists, you will receive a reset code." },
        { status: 200 }
      );
    }

    const emailLower = email.toLowerCase();
    const userExists = await prisma.user.findUnique({
      where: { email: emailLower },
      select: { id: true },
    });

    if (userExists) {
      await auth.api.requestPasswordReset({
        body: { email: emailLower },
      });
    }

    recordRequest(email);

    return NextResponse.json(
      { success: true, message: "If an account exists, you will receive a reset code." },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { success: true, message: "If an account exists, you will receive a reset code." },
      { status: 200 }
    );
  }
}
