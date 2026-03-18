import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";

const PUBLIC_PATHS = ["/", "/sign-in", "/sign-up"];
const AUTH_API_PREFIX = "/api/auth";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith(AUTH_API_PREFIX)) return true;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
    return true;
  // Allow static files and _next
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
