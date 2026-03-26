import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_NAME,
  createResetCookie,
  getResetCookieAttributes,
} from "@/lib/resetCookie";

const prisma = new PrismaClient();
const MAX_VERIFY_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.replace(/\D/g, "") : "";

    if (!email || !code || code.length !== 6) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired code." },
        { status: 400 }
      );
    }

    const record = await prisma.passwordResetCode.findFirst({
      where: {
        email,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!record) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired code." },
        { status: 400 }
      );
    }

    if (record.attemptCount >= MAX_VERIFY_ATTEMPTS) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Request a new code." },
        { status: 400 }
      );
    }

    const codeHash = crypto
      .createHash("sha256")
      .update(`${email}:${code}`)
      .digest("hex");

    if (codeHash !== record.codeHash) {
      await prisma.passwordResetCode.update({
        where: { id: record.id },
        data: { attemptCount: record.attemptCount + 1 },
      });
      return NextResponse.json(
        { success: false, error: "Invalid or expired code." },
        { status: 400 }
      );
    }

    const cookieValue = createResetCookie(record.betterAuthToken, email);
    const attrs = getResetCookieAttributes();
    const cookieParts = [
      `${COOKIE_NAME}=${cookieValue}`,
      `Path=${attrs.path}`,
      `Max-Age=${attrs.maxAge}`,
      `HttpOnly`,
      `SameSite=${attrs.sameSite}`,
    ];
    if (attrs.secure) cookieParts.push("Secure");

    const response = NextResponse.json({ success: true }, { status: 200 });
    response.headers.set("Set-Cookie", cookieParts.join("; "));

    return response;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid or expired code." },
      { status: 400 }
    );
  }
}
