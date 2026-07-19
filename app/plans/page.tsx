"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const PLANS = [
  {
    key: "standard",
    name: "Standard",
    price: "R1000",
    blurb: "Ideal for most marking.",
    points: ["Full AI marking", "Enough allowance for regular tests", "Standard accuracy"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "R3000",
    blurb: "5× the allowance — for large groups and exam season.",
    points: ["5× the monthly allowance", "Best for exam season", "High accuracy available"],
    featured: true,
  },
] as const;

type PlanKey = (typeof PLANS)[number]["key"];

export default function PlansPage() {
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"success" | "cancelled" | null>(null);

  // Read the return status from PayFast (?status=success|cancelled) on the client,
  // so we don't need a Suspense boundary for useSearchParams.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    if (s === "success" || s === "cancelled") setStatus(s);
  }, []);

  async function choosePlan(plan: PlanKey) {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch("/api/checkout/payfast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error === "not_configured"
            ? "Payments aren’t available right now. Please try again shortly."
            : "Couldn’t start checkout. Please try again.",
        );
      }
      const { action, fields } = (await res.json()) as {
        action: string;
        fields: { name: string; value: string }[];
      };
      // Build and submit a hidden form so the fields reach PayFast in the exact
      // order they were signed in (any reordering would break the signature).
      const form = document.createElement("form");
      form.method = "POST";
      form.action = action;
      for (const f of fields) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = f.name;
        input.value = f.value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F3F6FB] px-4 py-10">
      <div className="max-w-3xl mx-auto">
        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800 transition-colors mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to AutoMark
        </Link>

        <h1 className="text-[26px] font-bold text-slate-900 mb-1">Choose your plan</h1>
        <p className="text-[14px] text-slate-500 mb-8">
          Subscribe securely with card or Instant EFT. Your plan activates automatically — cancel anytime.
        </p>

        {/* Return status from PayFast */}
        {status === "success" && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13.5px] text-emerald-800">
            <strong className="font-semibold">Thanks — your payment is being confirmed.</strong> Your plan
            activates within a minute. If the allowance bar hasn’t updated, refresh the page.
          </div>
        )}
        {status === "cancelled" && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800">
            Checkout cancelled — you haven’t been charged. Pick a plan below whenever you’re ready.
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
            {error}
          </div>
        )}

        {/* Plans */}
        <div className="grid sm:grid-cols-2 gap-5 mb-8">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className={`rounded-2xl border bg-white p-6 flex flex-col ${
                "featured" in p && p.featured ? "border-[var(--accent-500)] ring-1 ring-[var(--accent-500)]" : "border-slate-200"
              }`}
            >
              {"featured" in p && p.featured && (
                <span className="self-start mb-3 text-[11px] font-semibold text-[var(--accent-700)] bg-[var(--accent-50)] px-2.5 py-1 rounded-full">
                  Most popular
                </span>
              )}
              <h2 className="text-[18px] font-bold text-slate-900">{p.name}</h2>
              <p className="text-[13px] text-slate-500 mb-4">{p.blurb}</p>
              <div className="mb-4">
                <span className="text-[28px] font-bold text-slate-900">{p.price}</span>
                <span className="text-[14px] text-slate-400"> / month</span>
              </div>
              <ul className="flex flex-col gap-2 mb-6">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-[13px] text-slate-600">
                    <svg className="w-4 h-4 text-[var(--accent-600)] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {pt}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => choosePlan(p.key)}
                disabled={busy !== null}
                className={`mt-auto text-center rounded-xl py-3 text-[14px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                  "featured" in p && p.featured
                    ? "bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-800"
                }`}
              >
                {busy === p.key ? "Redirecting to checkout…" : `Choose ${p.name}`}
              </button>
            </div>
          ))}
        </div>

        {/* Trust / how billing works */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 className="text-[15px] font-semibold text-slate-900 mb-3">How billing works</h3>
          <ul className="flex flex-col gap-2.5 text-[13.5px] text-slate-600">
            <li className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--accent-50)] text-[var(--accent-700)] text-[11px] font-bold flex items-center justify-center mt-0.5">1</span>
              Choose a plan and pay securely on PayFast — credit/cheque card or Instant EFT.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--accent-50)] text-[var(--accent-700)] text-[11px] font-bold flex items-center justify-center mt-0.5">2</span>
              Your plan activates automatically the moment payment is confirmed — no waiting, no admin.
            </li>
            <li className="flex items-start gap-2.5">
              <span className="shrink-0 w-5 h-5 rounded-full bg-[var(--accent-50)] text-[var(--accent-700)] text-[11px] font-bold flex items-center justify-center mt-0.5">3</span>
              It renews monthly and your allowance resets each cycle. Cancel anytime from PayFast.
            </li>
          </ul>
          <p className="mt-4 flex items-center gap-1.5 text-[12px] text-slate-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Payments are processed by PayFast. AutoMark never sees your card details.
          </p>
        </div>
      </div>
    </div>
  );
}
