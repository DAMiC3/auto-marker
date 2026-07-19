"use client";

import { useEffect, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import TermsBody from "@/components/TermsBody";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

// Blocking Terms & Conditions acceptance gate for EXISTING accounts. New signups
// accept via the checkbox on the login form (recorded at profile creation), so
// they never see this. Anyone whose profiles.terms_version doesn't match the
// current version is asked to accept before they can use the app.
//
// Mounted once in the root layout: it no-ops when signed out or already accepted,
// so it's safe on every page (login, /terms, etc.).
export default function TermsGate() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        if (!user || cancelled) return;
        const { data } = await sb.from("profiles").select("terms_version").eq("id", user.id).single();
        // Show the gate when the profile exists but hasn't accepted the current version.
        if (!cancelled && data && data.terms_version !== CURRENT_TERMS_VERSION) setShow(true);
      } catch {
        /* auth/profile read failed → don't block; enforcement is best-effort UI */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/terms/accept", { method: "POST" });
      if (!res.ok) throw new Error();
      setShow(false);
    } catch {
      setError("Couldn’t save your acceptance. Please try again.");
      setBusy(false);
    }
  }

  async function declineAndSignOut() {
    try {
      const sb = createClient();
      await sb.auth.signOut();
    } catch { /* ignore */ }
    window.location.href = "/login";
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm px-4 py-6">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-slate-200">
          <h2 className="text-[19px] font-bold text-slate-900">We’ve added Terms &amp; Conditions</h2>
          <p className="text-[13px] text-slate-500 mt-1">
            Please review and accept them to keep using AutoMark.
          </p>
        </div>

        <div className="px-6 py-5 overflow-y-auto text-slate-700">
          <TermsBody />
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
          {error && <p className="text-[13px] text-red-600 mb-2">{error}</p>}
          <div className="flex flex-col sm:flex-row-reverse gap-2.5">
            <button
              type="button"
              onClick={accept}
              disabled={busy}
              className="flex-1 rounded-xl py-3 text-[14px] font-semibold text-white bg-[var(--accent-600)] hover:bg-[var(--accent-700)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? "Saving…" : "I agree to the Terms & Conditions"}
            </button>
            <button
              type="button"
              onClick={declineAndSignOut}
              disabled={busy}
              className="rounded-xl py-3 px-4 text-[14px] font-medium text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-60"
            >
              Decline &amp; sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
