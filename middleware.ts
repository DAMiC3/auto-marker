// NOTE: middleware.ts (deprecated in Next 16) — used because @opennextjs/cloudflare
// currently only supports Edge middleware, not the new Node-runtime proxy.ts.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withTimeout } from "@/lib/withTimeout";

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const PUBLIC_PREFIXES = ["/login", "/auth"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets / PWA files — always allow
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icon") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // If Supabase isn't configured (e.g. local dev without env), don't gate.
  if (!url || !anonKey) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          res.cookies.set(name, value, options)
        );
      },
    },
  });

  // P4-1: a Supabase auth outage must not throw and break page loads broadly.
  // Treat a failed lookup as "no user" (fail closed) so protected pages route to
  // /login (itself public, so it stays reachable and there's no redirect loop).
  // P4-7: bound it so a HUNG auth call fails fast here rather than stalling the
  // page load until the Worker wall.
  let user = null;
  try {
    ({ data: { user } } = await withTimeout(supabase.auth.getUser(), 8000, "middleware getUser"));
  } catch (err) {
    console.error("Middleware getUser failed (auth outage?):", err);
  }
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // Not signed in and trying to reach a protected page → login
  if (!user && !isPublic) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Already signed in but on the login page → home
  if (user && pathname === "/login") {
    const home = req.nextUrl.clone();
    home.pathname = "/";
    return NextResponse.redirect(home);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
