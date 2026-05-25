import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Let public paths and static assets through
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icon") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Check auth cookie
  const token = req.cookies.get("am_auth")?.value;
  if (token && token === process.env.AUTH_SECRET) {
    return NextResponse.next();
  }

  // No AUTH_SECRET set → dev mode, allow through
  if (!process.env.AUTH_SECRET) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
