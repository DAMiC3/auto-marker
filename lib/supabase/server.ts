import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

/**
 * Server-side Supabase client bound to the request cookies, so it acts as the
 * signed-in user (RLS applies). Use in route handlers / server components.
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — safe to ignore; the proxy refreshes sessions.
        }
      },
    },
  });
}
