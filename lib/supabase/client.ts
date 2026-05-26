"use client";

import { createBrowserClient } from "@supabase/ssr";

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

/** Browser-side Supabase client (uses the public anon key + RLS). */
export function createClient() {
  return createBrowserClient(url, anonKey);
}
