import { NextResponse } from "next/server";
import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";
import { notifyOps } from "@/lib/notify";
import {
  isPlanKey,
  payfastConfig,
  PLAN_CATALOG,
  PAYFAST_VALID_HOSTS,
  validateItnWithPayfast,
  verifyItnSignature,
} from "@/lib/payfast";

export const dynamic = "force-dynamic";

// PayFast Instant Transaction Notification (ITN) handler — the ONLY place a plan is
// activated by a payment. PayFast POSTs application/x-www-form-urlencoded here after
// each successful charge (initial subscription payment + every monthly renewal).
//
// We ALWAYS return HTTP 200 once we've received a well-formed body, because PayFast
// retries on any non-200 and a retry can't fix a bad signature / wrong amount — a
// failed verification is logged + alerted instead. A plan is set only when EVERY
// check passes: signature (signed with our passphrase), payment_status COMPLETE,
// amount matches the plan price, PayFast's own postback says VALID, and the charge
// (pf_payment_id) hasn't already been processed (idempotency).
//
// Middleware allow-lists this path so PayFast's server (no auth cookie) can reach it.
export async function POST(req: Request) {
  const cfg = payfastConfig();

  // Read the raw body once — needed verbatim for the PayFast postback, and parsed
  // (order-preserving) for signature verification.
  let raw = "";
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  const entries: [string, string][] = [...new URLSearchParams(raw)];
  const data = Object.fromEntries(entries);

  // If we can't act on it, acknowledge (200) so PayFast stops retrying, and alert.
  if (!cfg.configured || !isServiceConfigured()) {
    await notifyOps("PayFast ITN received but gateway/metering not configured — ignored.");
    return new NextResponse("ok", { status: 200 });
  }

  // (1) Signature — proves it was signed with OUR passphrase and untampered.
  if (!verifyItnSignature(entries, cfg.passphrase)) {
    await notifyOps(`PayFast ITN REJECTED: signature mismatch (m_payment_id=${data.m_payment_id ?? "?"}).`);
    return new NextResponse("ok", { status: 200 });
  }

  // (soft) Origin host — informational only; signature + postback are authoritative.
  const host = req.headers.get("x-forwarded-host") || "";
  if (host && !PAYFAST_VALID_HOSTS.some((h) => host.includes(h))) {
    console.warn(`PayFast ITN from unexpected host header: ${host}`);
  }

  const pfPaymentId = data.pf_payment_id ?? "";
  const status = data.payment_status ?? "";
  const userId = data.custom_str1 ?? "";
  const plan = data.custom_str2 ?? "";
  const grossZar = Number(data.amount_gross ?? "0");

  // (2) Only COMPLETE charges activate. Anything else (e.g. a failed renewal) is
  // acknowledged and logged but never activates.
  if (status !== "COMPLETE") {
    console.warn(`PayFast ITN non-COMPLETE status '${status}' for ${userId || "?"} (${plan || "?"}).`);
    return new NextResponse("ok", { status: 200 });
  }

  // (3) Plan + amount sanity. custom_str2 must be a known plan and the gross paid
  // must match its price (guards a tampered/misconfigured amount — belt and braces
  // on top of the signature).
  if (!isPlanKey(plan)) {
    await notifyOps(`PayFast ITN REJECTED: unknown plan '${plan}' (pf_payment_id=${pfPaymentId}).`);
    return new NextResponse("ok", { status: 200 });
  }
  const expected = PLAN_CATALOG[plan].priceZar;
  if (Math.abs(grossZar - expected) > 0.01) {
    await notifyOps(
      `PayFast ITN REJECTED: amount R${grossZar} != R${expected} for plan '${plan}' (pf_payment_id=${pfPaymentId}). NOT activated.`,
    );
    return new NextResponse("ok", { status: 200 });
  }
  if (!userId || !pfPaymentId) {
    await notifyOps(`PayFast ITN REJECTED: missing user/charge id (pf_payment_id=${pfPaymentId || "?"}).`);
    return new NextResponse("ok", { status: 200 });
  }

  // (4) Server postback — the authoritative anti-spoof/anti-replay check.
  if (!(await validateItnWithPayfast(raw, cfg))) {
    await notifyOps(`PayFast ITN REJECTED: PayFast postback did not return VALID (pf_payment_id=${pfPaymentId}).`);
    return new NextResponse("ok", { status: 200 });
  }

  const svc = createServiceClient();

  // (5) Idempotency — record the charge first. A duplicate/replayed ITN for the same
  // pf_payment_id conflicts here and we no-op, so a plan is never renewed twice for
  // one charge. A genuine monthly renewal has a NEW pf_payment_id, so it proceeds.
  const { error: insErr } = await svc.from("payfast_payments").insert({
    pf_payment_id: pfPaymentId,
    m_payment_id: data.m_payment_id ?? null,
    user_id: userId,
    plan,
    amount_zar: grossZar,
    raw: data,
  });
  if (insErr) {
    // 23505 = unique_violation → already processed this charge. Acknowledge, do nothing.
    if ((insErr as { code?: string }).code === "23505") {
      return new NextResponse("ok", { status: 200 });
    }
    await notifyOps(`PayFast ITN: could not record charge ${pfPaymentId} for ${userId} — ${insErr.message}. Plan NOT activated.`);
    return new NextResponse("ok", { status: 200 });
  }

  // (6) Activate/renew. set_plan sets the cap + 30-day period, resets used_zar, and
  // the revenue_events trigger auto-logs R{1000|3000} as new/renewal.
  const { error: planErr } = await svc.rpc("set_plan", { p_user: userId, p_plan: plan });
  if (planErr) {
    // The charge is recorded but activation failed — this is money-in-without-plan.
    // Alert loudly so it can be granted manually; the ledger row is the audit trail.
    await notifyOps(
      `CRITICAL: PayFast payment received (pf_payment_id=${pfPaymentId}, ${plan}, R${grossZar}) for ${userId} but set_plan FAILED — ${planErr.message}. Grant manually.`,
    );
    return new NextResponse("ok", { status: 200 });
  }

  console.log(`PayFast: activated '${plan}' for ${userId} (pf_payment_id=${pfPaymentId}).`);
  return new NextResponse("ok", { status: 200 });
}
