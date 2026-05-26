"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

const PLAN_LABELS: Record<string, string> = {
  none:     "No active plan",
  standard: "Standard plan",
  pro:      "Pro plan",
};

export default function AllowanceBar() {
  const [plan, setPlan]   = useState<string | null>(null);
  const [pctUsed, setPct] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const { data } = await sb
      .from("profiles")
      .select("plan, allowance_cap_zar, used_zar")
      .eq("id", user.id)
      .single();
    if (!data) return;
    setPlan(data.plan);
    const cap = Number(data.allowance_cap_zar);
    const used = Number(data.used_zar);
    setPct(cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : null);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    const onRefresh = () => { refresh().catch(() => {}); };
    window.addEventListener("allowance-refresh", onRefresh);
    return () => window.removeEventListener("allowance-refresh", onRefresh);
  }, [refresh]);

  // Nothing to show until we know the plan
  if (plan === null) return null;

  const left = pctUsed === null ? null : 100 - pctUsed;
  const low  = left !== null && left <= 15;

  return (
    <Link
      href="/plans"
      className="block px-3 py-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors mb-2"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-medium text-[#9BAECC]">{PLAN_LABELS[plan] ?? plan}</span>
        {left !== null && (
          <span className={`text-[11px] font-semibold ${low ? "text-red-300" : "text-[#9BAECC]"}`}>
            {left}% left
          </span>
        )}
      </div>
      {pctUsed === null ? (
        <p className="text-[11px] text-[var(--accent-400)]">Buy a plan to start marking →</p>
      ) : (
        <>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${low ? "bg-red-400" : "bg-[var(--accent-500)]"}`}
              style={{ width: `${pctUsed}%` }}
            />
          </div>
          {low && <p className="text-[10px] text-red-300 mt-1.5">Running low — tap to renew →</p>}
        </>
      )}
    </Link>
  );
}
