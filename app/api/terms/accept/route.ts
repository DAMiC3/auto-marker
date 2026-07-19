import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";
import { notifyOps } from "@/lib/notify";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

export const dynamic = "force-dynamic";

// Records that the signed-in user has accepted the current Terms & Conditions.
// The client pop-up (components/TermsGate) POSTs here when the user clicks "I Agree".
// We identify the user from THEIR session cookie, so nobody can accept on another
// user's behalf, and write via the service client (same pattern as the trial route).
export async function POST() {
  if (!isServiceConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let userId: string | null = null;
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("profiles")
    .update({ terms_version: CURRENT_TERMS_VERSION, terms_accepted_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    await notifyOps(`Terms acceptance failed to record for ${userId} — ${error.message}`);
    return NextResponse.json({ error: "accept_failed" }, { status: 503 });
  }

  return NextResponse.json({ ok: true, version: CURRENT_TERMS_VERSION });
}
