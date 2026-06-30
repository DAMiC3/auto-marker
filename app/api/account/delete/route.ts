import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";
import { notifyOps } from "@/lib/notify";

// P7-8: POPIA account deletion. Hard-deletes the caller's auth.users row, which the
// schema's foreign keys turn into exactly the right cleanup:
//   • profiles      → ON DELETE CASCADE  → removed
//   • usage_events  → ON DELETE CASCADE  → removed
//   • trial_claims  → no FK (email-keyed) → KEPT, so the one-free-trial-per-email
//                     guard (P1-7) still blocks a delete-then-re-signup re-claim.
//   • revenue_events→ ON DELETE SET NULL (+ email snapshot) → KEPT, so the business's
//                     financial/tax records survive the user's deletion.
// No SQL/migration needed — the cascade rules already encode this policy.
export async function POST() {
  if (!isServiceConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Identify the caller from their own session — a user can only delete themselves.
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
  const { error } = await svc.auth.admin.deleteUser(userId);
  if (error) {
    await notifyOps(`Account deletion failed for ${userId} — ${error.message}`);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  // The client signs out after this so the now-orphaned session cookie is cleared.
  return NextResponse.json({ ok: true });
}
