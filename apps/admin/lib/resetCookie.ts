import crypto from "node:crypto";

const COOKIE_NAME = "__password_reset";
const COOKIE_MAX_AGE = 15 * 60; // 15 minutes, match code expiry

function getSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required");
  return secret;
}

export function createResetCookie(token: string, email: string): string {
  const payload = {
    t: token,
    e: email.toLowerCase(),
    exp: Date.now() + COOKIE_MAX_AGE * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyResetCookie(cookieValue: string): {
  token: string;
  email: string;
} | null {
  const [encoded, sig] = cookieValue.split(".");
  if (!encoded || !sig) return null;
  const expectedSig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as { t: string; e: string; exp: number };
    if (payload.exp < Date.now()) return null;
    if (!payload.t || !payload.e) return null;
    return { token: payload.t, email: payload.e };
  } catch {
    return null;
  }
}

export function getResetCookieAttributes(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  };
}

export { COOKIE_NAME };
