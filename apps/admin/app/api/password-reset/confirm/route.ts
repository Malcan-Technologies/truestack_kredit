import { auth } from "@/lib/auth-server";
import { PrismaClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, getResetCookieAttributes, verifyResetCookie } from "@/lib/resetCookie";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get("cookie") || "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [k, v] = c.trim().split("=");
        return [k, v ?? ""];
      })
    );
    const cookieValue = cookies[COOKIE_NAME];

    if (!cookieValue) {
      return NextResponse.json(
        { success: false, error: "Session expired. Please request a new code." },
        { status: 400 }
      );
    }

    const parsed = verifyResetCookie(cookieValue);
    if (!parsed) {
      const attrs = getResetCookieAttributes();
      const clearCookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=lax`;
      const res = NextResponse.json(
        { success: false, error: "Session expired. Please request a new code." },
        { status: 400 }
      );
      res.headers.set("Set-Cookie", clearCookie);
      return res;
    }

    const body = await request.json();
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

    if (!newPassword || newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json(
        { success: false, error: "Password must be 8–128 characters." },
        { status: 400 }
      );
    }

    try {
      await auth.api.resetPassword({
        body: { newPassword, token: parsed.token },
      });
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid or expired code. Please request a new one." },
        { status: 400 }
      );
    }

    await prisma.passwordResetCode.updateMany({
      where: { email: parsed.email, usedAt: null },
      data: { usedAt: new Date() },
    });

    const attrs = getResetCookieAttributes();
    const clearCookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=lax`;
    const res = NextResponse.json({ success: true }, { status: 200 });
    res.headers.set("Set-Cookie", clearCookie);

    return res;
  } catch {
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
