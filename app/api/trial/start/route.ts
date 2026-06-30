import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";
import { notifyOps } from "@/lib/notify";

// P7-1: self-serve free-trial activation. Closes the first-run dead-end where a
// confirmed, signed-in user lands at R0/blocked with no way forward but a manual
// SQL grant. The button (components/TrialCta.tsx) POSTs here.
//
// set_plan() is SECURITY DEFINER and EXECUTE is granted to service_role ONLY
// (migration 20260526121801), so the grant must go through the service client.
// We identify the caller from THEIR cookie session first, so a user can only
// ever start a trial for themselves — never for an arbitrary uuid.
//
// The one-trial-per-email guard (P1-7, trial_claims ledger) lives inside
// set_plan: a repeat claim raises `trial_already_used`, surfaced here as a 409.
export async function POST() {
  // A trial can't be granted without the privileged client. On an unmetered
  // local deploy there's no profile/enforcement anyway, so this is a clean no-op error.
  if (!isServiceConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Identify the caller from their own session — never trust a uuid from the body.
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

  // Guard against downgrading someone who already has (or had) a plan. The button
  // only renders for plan='none' users, but the server must not rely on the UI:
  // calling set_plan('trial') on a 'standard'/'pro'/'trial' row would clobber it.
  try {
    const { data, error } = await svc
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .single();
    if (error) throw new Error(error.message);
    if (data && data.plan !== "none") {
      return NextResponse.json({ error: "already_has_plan" }, { status: 409 });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await notifyOps(`Trial start blocked: could not read profile for ${userId} — ${msg}`);
    return NextResponse.json({ error: "trial_failed" }, { status: 503 });
  }

  // Grant the trial. set_plan enforces one-per-email via the trial_claims ledger.
  const { error } = await svc.rpc("set_plan", { p_user: userId, p_plan: "trial" });
  if (error) {
    // Expected case: this email already claimed its free trial (P1-7).
    if (error.message.includes("trial_already_used")) {
      return NextResponse.json({ error: "trial_already_used" }, { status: 409 });
    }
    // Anything else is an unexpected backend failure — page ops.
    await notifyOps(`Trial start failed for ${userId} — ${error.message}`);
    return NextResponse.json({ error: "trial_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
