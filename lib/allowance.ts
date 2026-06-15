// Pure, client-safe allowance helpers — NO database/server imports, so this can
// be imported by both server routes (via lib/usage.ts) and client components.
// The cap/period logic lives here once; lib/usage.ts's isBlocked() delegates to
// it so enforcement and the UI notices can never drift apart.

export interface AllowanceState {
  plan: string;
  allowance_cap_zar: number | string;
  used_zar: number | string;
  period_end: string | null;
}

// Why a user is blocked from marking, or null if they can mark.
// - "no_plan"  → cap is 0 (a 'none' user who has never been granted a plan)
// - "expired"  → the billing period has ended
// - "limit"    → used up the allowance for the period
export type BlockReason = "no_plan" | "expired" | "limit" | null;

export function blockReason(p: AllowanceState | null): BlockReason {
  if (!p) return null; // unknown — callers decide; isBlocked() fails closed separately
  const cap = Number(p.allowance_cap_zar);
  const used = Number(p.used_zar);
  const timeUp = !!p.period_end && new Date(p.period_end) <= new Date();
  if (cap <= 0) return "no_plan";
  if (timeUp) return "expired";
  if (used >= cap) return "limit";
  return null;
}

// Human date for the plan-expiry line in Settings, e.g. "15 July 2026".
export function formatExpiry(periodEnd: string | null): string | null {
  if (!periodEnd) return null;
  const d = new Date(periodEnd);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

// True if the period has already ended (past period_end).
export function isExpired(periodEnd: string | null): boolean {
  return !!periodEnd && new Date(periodEnd) <= new Date();
}
