import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Matches Better Auth defaults in lib/auth-server.ts (no custom cookiePrefix). */
const SESSION_COOKIE_OPTS = {
  cookiePrefix: "better-auth",
  cookieName: "session_token",
} as const;

export function middleware(request: NextRequest) {
  const token = getSessionCookie(request, SESSION_COOKIE_OPTS);
  if (!token) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set(
      "returnTo",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(login);
  }

  const res = NextResponse.next();
  res.headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate"
  );
  return res;
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
