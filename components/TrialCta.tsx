"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { blockReason, type BlockReason } from "@/lib/allowance";

// P7-1: the self-serve free-trial CTA. A brand-new, confirmed, signed-in user lands
// at plan='none' / R0 ("no_plan") with nothing to do — this is the onboarding dead-end.
// PlanNotice deliberately ignores "no_plan" (it only warns users who LOST a plan), so
// this component owns that state: one prominent "Start free trial" button that calls
// POST /api/trial/start → set_plan(user,'trial'). 7 days / R50, no card (ADR-002).
type Phase = "idle" | "starting" | "started" | "used" | "error";

export default function TrialCta() {
  const [reason, setReason] = useState<BlockReason>(null);
  const [phase, setPhase]   = useState<Phase>("idle");

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

  async function startTrial() {
    setPhase("starting");
    try {
      const res = await fetch("/api/trial/start", { method: "POST" });
      if (res.ok) {
        setPhase("started");
        // Let AllowanceBar / PlanNotice / the Mark gate re-read the new plan.
        window.dispatchEvent(new Event("allowance-refresh"));
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setPhase(body.error === "trial_already_used" ? "used" : "error");
    } catch {
      setPhase("error");
    }
  }

  // Only the first-run "no plan yet" state gets this card. Once a trial (or any plan)
  // is active the user is no longer "no_plan", so it disappears on the next refresh.
  if (reason !== "no_plan") return null;

  // Success — confirmed active. Brief, friendly, and self-clearing once they mark.
  if (phase === "started") {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4">
        <p className="text-[14px] font-semibold text-green-800">Your free trial is active 🎉</p>
        <p className="text-[13px] text-green-700 mt-0.5">
          You’ve got 7 days to mark. Connect your files below and hit Mark to get started.
        </p>
      </div>
    );
  }

  // Already used their one free trial (P1-7) — point them at the plans page.
  if (phase === "used") {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-amber-800">You’ve already used your free trial</p>
          <p className="text-[13px] text-amber-700 mt-0.5">Choose a plan to keep marking.</p>
        </div>
        <Link
          href="/plans"
          className="shrink-0 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[13px] font-semibold transition-colors"
        >
          See plans
        </Link>
      </div>
    );
  }

  // Default: the offer (idle / starting / error all share this card; error adds a line).
  return (
    <div className="bg-[var(--accent-50)] border border-[var(--accent-100)] rounded-xl px-5 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-slate-900">Start your free trial</p>
        <p className="text-[13px] text-slate-600 mt-0.5">
          7 days of marking, free — no card needed. Activate it now and start marking right away.
        </p>
        {phase === "error" && (
          <p className="text-[13px] text-red-600 mt-1.5">
            Couldn’t start your trial just now. Please try again in a moment.
          </p>
        )}
      </div>
      <button
        onClick={startTrial}
        disabled={phase === "starting"}
        className="shrink-0 px-5 py-2.5 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-[13px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {phase === "starting" ? "Starting…" : "Start free trial"}
      </button>
    </div>
  );
}
