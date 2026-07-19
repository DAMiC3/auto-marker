import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isServiceConfigured } from "@/lib/supabase/service";
import { notifyOps } from "@/lib/notify";
import { buildCheckout, isPlanKey, payfastConfig } from "@/lib/payfast";

export const dynamic = "force-dynamic";

// Starts a PayFast recurring-subscription checkout for the signed-in user.
// Returns the signed form (action + ordered fields) which the client auto-submits
// to PayFast. The plan is NOT activated here — activation happens only when the
// verified ITN reaches /api/webhooks/payfast, which trusts custom_str1 (this user)
// and custom_str2 (the plan) only after the signature + PayFast postback both pass.
export async function POST(req: Request) {
  const cfg = payfastConfig();
  if (!cfg.configured || !isServiceConfigured()) {
    // Missing PayFast creds or metering — nothing to sell against. Fail loudly so a
    // misconfigured deploy doesn't silently look broken to a paying user.
    await notifyOps("PayFast checkout unavailable — merchant creds or Supabase service key missing.");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Identify the caller from THEIR cookie session — never trust a uuid from the body.
  let userId: string | null = null;
  let email = "";
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    userId = user?.id ?? null;
    email = user?.email ?? "";
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  // Which plan?
  let plan: unknown;
  try {
    plan = (await req.json())?.plan;
  } catch {
    plan = undefined;
  }
  if (!isPlanKey(plan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  // Absolute URLs for PayFast. Prefer the configured app URL; fall back to the
  // request origin (correct in production on workers.dev). notify_url MUST be
  // publicly reachable by PayFast's servers.
  const base = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  const mPaymentId = crypto.randomUUID();

  const form = buildCheckout({
    cfg,
    plan,
    mPaymentId,
    userId,
    email,
    returnUrl: `${base}/plans?status=success`,
    cancelUrl: `${base}/plans?status=cancelled`,
    notifyUrl: `${base}/api/webhooks/payfast`,
  });

  return NextResponse.json(form);
}
