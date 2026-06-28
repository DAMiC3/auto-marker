// Server-only allowance enforcement + usage recording helpers.
// Centralises the "is this user allowed to mark?" decision so the instant and
// batch routes can't drift apart.

import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { BATCH_RATES, USD_TO_ZAR } from "@/lib/cost";
import { blockReason, type AllowanceState } from "@/lib/allowance";
import { enqueuePendingUsage, drainPendingUsage } from "@/lib/pendingUsage";
import { notifyOps } from "@/lib/notify";
import { withTimeout } from "@/lib/withTimeout";

// P4-7: cap on any single Supabase round-trip. A hung call rejects after this
// instead of riding to the 60s Worker wall; the surrounding try/catch then fails
// closed fast. Generous enough that a healthy call never trips it.
const DB_TIMEOUT_MS = 8000;

// Re-export so existing imports of AllowanceProfile keep working; the canonical
// shape now lives in the client-safe lib/allowance.ts.
export type AllowanceProfile = AllowanceState;

// Summary of one paper's page composition for pre-flight cost estimation.
export interface PaperPageSummary {
  textPages: number;   // pages with extracted text — cheap (~600 tokens/page)
  imagePages: number;  // scanned/image pages — expensive (~2000 tokens/page at typical A4 render resolution)
}

// Per-page token budgets for pre-flight estimation, calibrated against Anthropic docs
// and docs/cost-and-pricing-notes.md. Text pages are typed/extracted (with y-position
// markers); image pages are scanned A4s (cost notes put these at 1000–2000+ tokens —
// using 2000 as a conservative high estimate so we under-promise). Shared content
// (system prompt ~700t + memo ~1000t) is charged as cache_read because all papers in
// a batch share the same prefix and caching kicks in after the first paper.
const TEXT_PAGE_TOKENS  = 600;
const IMAGE_PAGE_TOKENS = 2000;
const SHARED_CACHE_READ = 1700;  // system (~700) + memo (~1000), treated as cache_read
const OUTPUT_TOKENS     = 400;   // JSON annotations + summary per paper

const QUALITY_TO_MODEL = {
  standard: "claude-sonnet-4-6",
  high:     "claude-opus-4-7",
} as const;

// Estimates total batch cost in ZAR for a set of papers.
// Uses batch-discounted rates (50% off standard) and differentiates text vs image pages.
// Deliberately conservative on image pages so we under-promise rather than let a batch
// blow past the cap.
export function estimateBatchCostZar(papers: PaperPageSummary[], quality: "standard" | "high"): number {
  const r = BATCH_RATES[QUALITY_TO_MODEL[quality]];
  let usd = 0;
  for (const p of papers) {
    usd +=
      (p.textPages * TEXT_PAGE_TOKENS + p.imagePages * IMAGE_PAGE_TOKENS) * r.in +
      SHARED_CACHE_READ * r.cacheRead +
      OUTPUT_TOKENS * r.out;
  }
  return usd * USD_TO_ZAR;
}

// Hard ceiling on documents in a single batch submission (P1-4 / safety rule C15).
// Caps the blast radius of any single estimate miss. Enforced server-side in the
// batch route, not just the client loop, so a buggy/hostile client can't bypass it.
export const MAX_BATCH_DOCS = 100;

// How many of the LEADING documents fit within `remainingZar` by the (conservative)
// pre-flight estimate, capped at MAX_BATCH_DOCS. Documents are atomic — whole papers,
// you can't mark half — so this returns a whole count. This is the chunk-sizing oracle
// for the P1-4 loop: the client never sees Rand, it only learns how many documents it
// may send next. Returns 0 when not even one more document fits (the loop's stop signal,
// safety rule C1). Order matters — pass papers in submission order.
export function affordableDocCount(
  papers: PaperPageSummary[],
  remainingZar: number,
  quality: "standard" | "high",
): number {
  if (!(remainingZar > 0)) return 0; // also guards NaN/Infinity (C4)
  let cumulative = 0;
  let n = 0;
  for (const p of papers) {
    if (n >= MAX_BATCH_DOCS) break;
    cumulative += estimateBatchCostZar([p], quality);
    if (cumulative > remainingZar) break;
    n++;
  }
  return n;
}

// Returns true if the user is BLOCKED from marking.
// Enforced for EVERY plan, including 'none' (cap 0 → "no_plan" → blocked):
// a user with no active plan has a R0 allowance and cannot mark.
// A missing profile also fails closed — no profile means no allowance.
// Delegates to blockReason() in lib/allowance.ts so the server gate and the
// client-side plan notices share one definition of "blocked".
export function isBlocked(profile: AllowanceProfile | null): boolean {
  if (!profile) return true; // fail closed
  return blockReason(profile) !== null;
}

// Result of the pre-mark allowance gate. When `allowed`, the route may proceed and
// (for batch) use `profile` for the cost pre-flight. When not allowed, the route
// MUST return `status` + `{ error }` and mark NOTHING.
export type AllowanceCheck =
  | { allowed: true; userId: string | null; profile: AllowanceProfile | null }
  | { allowed: false; status: number; error: string };

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Single fail-CLOSED gate shared by the instant and batch routes. Policy: if the
// deployment is metered (service configured) and ANYTHING needed to verify the
// allowance fails — auth lookup, profile read, or the user being over their limit —
// marking is BLOCKED. We never mark "blind" when a check errors out. Genuine backend
// failures (not the normal over-limit case) also page ops via notifyOps so a silent
// outage that's turning users away gets noticed.
export async function checkAllowance(): Promise<AllowanceCheck> {
  // Unmetered deployment (local/dev with no service key): nothing to enforce.
  if (!isServiceConfigured()) {
    return { allowed: true, userId: null, profile: null };
  }

  // Resolve the user. A thrown error here is a backend/auth failure → block + alert.
  let userId: string | null;
  try {
    const sb = await createUserClient();
    const { data: { user } } = await withTimeout(sb.auth.getUser(), DB_TIMEOUT_MS, "auth getUser");
    userId = user?.id ?? null;
  } catch (e) {
    await notifyOps(`Marking blocked: auth lookup failed during allowance check — ${errMsg(e)}`);
    return { allowed: false, status: 503, error: "verification_failed" };
  }

  // Metered deployment but no identifiable user → block. No free marking for an
  // unauthenticated/expired session. This is a client auth issue, not a backend
  // outage, so block without paging ops.
  if (!userId) {
    return { allowed: false, status: 401, error: "not_authenticated" };
  }

  // Read the allowance. supabase-js RETURNS errors instead of throwing, so treat
  // either a thrown error or a returned error as a verification failure → block + alert.
  let profile: AllowanceProfile | null;
  try {
    const svc = createServiceClient();
    const { data, error } = await withTimeout(
      svc
        .from("profiles")
        .select("plan, allowance_cap_zar, used_zar, period_end")
        .eq("id", userId)
        .single(),
      DB_TIMEOUT_MS,
      "profiles read",
    );
    if (error) throw new Error(error.message);
    profile = data;
  } catch (e) {
    await notifyOps(`Marking blocked: could not read allowance for ${userId} — ${errMsg(e)}`);
    return { allowed: false, status: 503, error: "verification_failed" };
  }

  // Normal over-limit / no-plan / expired case — block, but this is expected, not an error.
  if (isBlocked(profile)) {
    return { allowed: false, status: 402, error: "allowance_exhausted" };
  }

  return { allowed: true, userId, profile };
}

// Record usage with retries. add_usage runs AFTER marking has already happened,
// so a silent failure means the user got marking for free. supabase-js returns
// errors instead of throwing, so the old `await svc.rpc(...)` (no error check)
// could swallow a failed write entirely. Retry; if it still fails, PARK the event
// in the durable dead-letter buffer (Cloudflare D1) so it's replayed automatically
// on the next successful write, and alert ops. Returns true once the live counter
// was updated; false if the event was parked for later (not lost).
export async function recordUsage(
  userId: string,
  costZar: number,
  papers: number,
  tier: string,
): Promise<boolean> {
  const svc = createServiceClient();
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { error } = await withTimeout(
        svc.rpc("add_usage", {
          p_user: userId,
          p_cost: costZar,
          p_papers: papers,
          p_tier: tier,
          p_file: null,
        }),
        DB_TIMEOUT_MS,
        "add_usage",
      );
      if (!error) {
        // Supabase is healthy → opportunistically flush anything parked during a
        // previous outage. No-op when the buffer is empty.
        drainPendingUsage().catch((e) => console.error("drainPendingUsage failed:", e));
        return true;
      }
      console.error(`add_usage attempt ${attempt}/3 failed:`, error.message);
    } catch (e) {
      console.error(`add_usage attempt ${attempt}/3 threw:`, e);
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 250 * attempt));
  }

  // All retries failed — park it durably rather than lose it, and alert.
  console.error(
    `CRITICAL: usage write failed — user=${userId} cost=${costZar} papers=${papers} tier=${tier}. Parking in dead-letter buffer.`,
  );
  await enqueuePendingUsage({ userId, costZar, papers, tier, ts: Date.now() });
  await notifyOps(
    `Supabase usage write failed — parked R${costZar.toFixed(2)} (${papers} paper(s), ${tier}) for user ${userId}. Will auto-retry on next successful write.`,
  );
  return false;
}
