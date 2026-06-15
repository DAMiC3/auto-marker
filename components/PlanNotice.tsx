"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { blockReason, type BlockReason } from "@/lib/allowance";

// Prominent banner shown when a user who HAD a plan can no longer mark:
// either the billing period expired, or they used up their allowance.
// (Brand-new "no_plan" users are nudged by the AllowanceBar instead, so we
// don't show them an alarming "expired" banner.)
const NOTICE: Record<"expired" | "limit", { title: string; body: string }> = {
  expired: {
    title: "Your plan has expired",
    body: "Your billing period has ended. Buy a new plan to keep marking.",
  },
  limit: {
    title: "You’ve reached your plan limit",
    body: "You’ve used up this period’s allowance. Buy a new plan to keep marking.",
  },
};

export default function PlanNotice() {
  const [reason, setReason] = useState<BlockReason>(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { setReason(null); return; }
    const { data } = await sb
      .from("profiles")
      .select("plan, allowance_cap_zar, used_zar, period_end")
      .eq("id", user.id)
      .single();
    setReason(blockReason(data ?? null));
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    const onRefresh = () => { refresh().catch(() => {}); };
    window.addEventListener("allowance-refresh", onRefresh);
    return () => window.removeEventListener("allowance-refresh", onRefresh);
  }, [refresh]);

  // Only the two "lost their plan" states get the banner.
  if (reason !== "expired" && reason !== "limit") return null;
  const n = NOTICE[reason];

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-red-800">{n.title}</p>
        <p className="text-[13px] text-red-700 mt-0.5">{n.body}</p>
      </div>
      <Link
        href="/plans"
        className="shrink-0 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold transition-colors"
      >
        Buy a new plan
      </Link>
    </div>
  );
}
