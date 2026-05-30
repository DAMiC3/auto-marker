// NOTE: middleware.ts (deprecated in Next 16) — used because @opennextjs/cloudflare
// currently only supports Edge middleware, not the new Node-runtime proxy.ts.
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

  const { data: { user } } = await supabase.auth.getUser();
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
