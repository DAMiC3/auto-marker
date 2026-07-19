// Server-only PayFast integration helpers (checkout signing + ITN verification).
//
// PayFast signs every request/notification with an MD5 over the field set. Web
// Crypto (crypto.subtle) does NOT implement MD5, so we use node:crypto — available
// in the Worker because `nodejs_compat` is enabled (see wrangler.jsonc). This module
// is imported only by the two server routes (checkout + webhook); never by client code.
//
// Docs followed: PayFast "Custom integration" + "ITN" + "Recurring billing".
import { createHash } from "node:crypto";

export type PlanKey = "standard" | "pro";

// The two paid plans and their monthly ZAR price. Mirrors public.plan_price() in
// Supabase (standard=1000, pro=3000) — the DB remains the source of truth for the
// allowance CAP (set_plan); this is only what PayFast charges.
export const PLAN_CATALOG: Record<PlanKey, { label: string; priceZar: number }> = {
  standard: { label: "AutoMark Standard", priceZar: 1000 },
  pro:      { label: "AutoMark Pro",      priceZar: 3000 },
};

export function isPlanKey(v: unknown): v is PlanKey {
  return v === "standard" || v === "pro";
}

// ── Config (env-driven; secrets set via `wrangler secret put`) ────────────────
export interface PayfastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;   // "" if the PayFast account has no passphrase set
  mode: "sandbox" | "live";
  processUrl: string;   // where the browser is sent to pay
  validateUrl: string;  // server-to-server ITN validation postback
  configured: boolean;
}

export function payfastConfig(): PayfastConfig {
  const merchantId  = process.env.PAYFAST_MERCHANT_ID ?? "";
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY ?? "";
  const passphrase  = process.env.PAYFAST_PASSPHRASE ?? "";
  // Default to SANDBOX. Going live is a deliberate flip to PAYFAST_MODE=live, so a
  // half-configured deploy can never accidentally take real money.
  const mode = process.env.PAYFAST_MODE === "live" ? "live" : "sandbox";
  const host = mode === "live" ? "https://www.payfast.co.za" : "https://sandbox.payfast.co.za";
  return {
    merchantId,
    merchantKey,
    passphrase,
    mode,
    processUrl:  `${host}/eng/process`,
    validateUrl: `${host}/eng/query/validate`,
    configured: Boolean(merchantId && merchantKey),
  };
}

// ── Signature ─────────────────────────────────────────────────────────────────
// PayFast urlencodes values PHP-style: encodeURIComponent, but spaces as "+".
// (This matches PayFast's official Node.js sample exactly.)
function pfEncode(value: string): string {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+");
}

// Build the "key=value&key=value..." string PayFast hashes. `pairs` MUST already be
// in the exact order the fields are sent (checkout) or received (ITN). The passphrase,
// when the account has one, is appended last — never included in the sent field list.
function paramString(pairs: [string, string][], passphrase: string): string {
  const body = pairs.map(([k, v]) => `${k}=${pfEncode(v)}`).join("&");
  return passphrase ? `${body}&passphrase=${pfEncode(passphrase)}` : body;
}

export function signature(pairs: [string, string][], passphrase: string): string {
  return createHash("md5").update(paramString(pairs, passphrase), "utf8").digest("hex");
}

// ── Checkout (recurring subscription) ─────────────────────────────────────────
export interface CheckoutInput {
  cfg: PayfastConfig;
  plan: PlanKey;
  mPaymentId: string;   // our unique reference (uuid)
  userId: string;       // echoed back in the ITN as custom_str1
  email: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
}

export interface CheckoutForm {
  action: string;                              // PayFast process URL to POST to
  fields: { name: string; value: string }[];  // ordered; last field is the signature
}

// Produce the ordered field list + signature for a recurring monthly subscription.
// subscription_type=1 charges `amount` now and `recurring_amount` every month
// (frequency=3) indefinitely (cycles=0) until the customer cancels at PayFast.
// The signature is computed over these fields IN THIS ORDER, and they are returned
// in the same order so the submitted form reproduces the signed string exactly.
export function buildCheckout(input: CheckoutInput): CheckoutForm {
  const { cfg, plan, mPaymentId, userId, email, returnUrl, cancelUrl, notifyUrl } = input;
  const { label, priceZar } = PLAN_CATALOG[plan];
  const amount = priceZar.toFixed(2);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Order matters — this is the single source of truth for both the signature and
  // the submitted form.
  const pairs: [string, string][] = [
    ["merchant_id",  cfg.merchantId],
    ["merchant_key", cfg.merchantKey],
    ["return_url",   returnUrl],
    ["cancel_url",   cancelUrl],
    ["notify_url",   notifyUrl],
    ["email_address", email],
    ["m_payment_id", mPaymentId],
    ["amount",       amount],
    ["item_name",    `${label} plan`],
    ["item_description", `${label} monthly subscription`],
    ["custom_str1",  userId],
    ["custom_str2",  plan],
    // Recurring subscription
    ["subscription_type", "1"],
    ["billing_date",      today],
    ["recurring_amount",  amount],
    ["frequency",         "3"],  // 3 = monthly
    ["cycles",            "0"],  // 0 = until cancelled
  ];

  const sig = signature(pairs, cfg.passphrase);
  const fields = pairs.map(([name, value]) => ({ name, value }));
  fields.push({ name: "signature", value: sig });
  return { action: cfg.processUrl, fields };
}

// ── ITN (webhook) verification ────────────────────────────────────────────────
// Recompute the signature from the posted fields IN RECEIVED ORDER, excluding the
// posted `signature`. Returns true only if it matches — i.e. the notification was
// signed with OUR passphrase and hasn't been tampered with.
export function verifyItnSignature(entries: [string, string][], passphrase: string): boolean {
  const posted = entries.find(([k]) => k === "signature")?.[1] ?? "";
  const pairs = entries.filter(([k]) => k !== "signature");
  const expected = signature(pairs, passphrase);
  return posted.length > 0 && posted.toLowerCase() === expected.toLowerCase();
}

// Server-to-server confirmation: post the raw ITN body back to PayFast; a genuine
// notification returns "VALID". This is the authoritative anti-spoof check — even
// if someone replayed a captured, correctly-signed body, PayFast still gates it.
export async function validateItnWithPayfast(rawBody: string, cfg: PayfastConfig): Promise<boolean> {
  try {
    const res = await fetch(cfg.validateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: rawBody,
    });
    const text = (await res.text()).trim();
    return text.toUpperCase().startsWith("VALID");
  } catch {
    return false; // network failure → treat as not-yet-validated (caller will not activate)
  }
}

// PayFast's published source hosts for the ITN, for a soft origin check. Not a hard
// gate (signature + server postback are authoritative and DNS from a Worker is
// unreliable) — a miss here only warns.
export const PAYFAST_VALID_HOSTS = [
  "www.payfast.co.za",
  "w1w.payfast.co.za",
  "w2w.payfast.co.za",
  "sandbox.payfast.co.za",
];
