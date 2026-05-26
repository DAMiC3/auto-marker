import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const url        = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isServiceConfigured(): boolean {
  return Boolean(url && serviceKey);
}

/**
 * Privileged server-only client (service role — BYPASSES RLS).
 * Never import this into client code. Used for metering writes:
 * recording usage and assigning/renewing plans.
 */
export function createServiceClient() {
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
