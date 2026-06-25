"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { authErrorMessage } from "@/lib/authErrors";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [notice, setNotice]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true);
  const [ready, setReady]       = useState(false); // recovery session present?

  const configured = isSupabaseConfigured();

  // The reset link routes through /auth/callback, which exchanges the code for a
  // (recovery) session before sending us here. Confirm that session exists — if
  // it doesn't, the link was invalid/expired and there's nothing to update.
  useEffect(() => {
    if (!configured) { setChecking(false); return; }
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setReady(Boolean(data.user)))
      .catch(() => setReady(false))
      .finally(() => setChecking(false));
  }, [configured]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");

    if (password !== confirm) {
      setError("The two passwords don’t match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(authErrorMessage(error.message));
      setLoading(false);
      return;
    }
    // updateUser keeps the user signed in, so send them straight into the app.
    setNotice("Password updated. Taking you to the app…");
    router.push("/");
    router.refresh();
  }

  const inputClass =
    "w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[var(--accent-500)] focus:ring-1 focus:ring-[var(--accent-500)] transition";

  return (
    <div className="min-h-screen bg-[#0E1525] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-600)] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <span className="text-white text-[20px] font-bold tracking-tight">AutoMark</span>
        </div>

        {/* Card */}
        <div className="bg-[#161E2E] rounded-2xl border border-white/10 px-8 py-8">
          <h1 className="text-white text-[18px] font-semibold mb-1">Set a new password</h1>
          <p className="text-slate-400 text-[13px] mb-6">Choose a new password for your account.</p>

          {checking ? (
            <p className="text-slate-400 text-[13px]">Checking your reset link…</p>
          ) : !configured ? (
            <p className="text-red-400 text-[13px]">Password reset isn’t configured yet.</p>
          ) : !ready ? (
            <div className="flex flex-col gap-4">
              <p className="text-red-400 text-[13px]">
                This reset link is invalid or has expired. Request a new one from the sign-in page.
              </p>
              <Link
                href="/login"
                className="w-full rounded-xl py-3 text-center font-semibold text-[14px] text-white bg-[var(--accent-600)] hover:bg-[var(--accent-700)] transition-all"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
                className={inputClass}
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
                className={inputClass}
              />

              {error && <p className="text-red-400 text-[13px]">{error}</p>}
              {notice && <p className="text-emerald-400 text-[13px]">{notice}</p>}

              <button
                type="submit"
                disabled={loading}
                className={`mt-1 w-full rounded-xl py-3 font-semibold text-[14px] text-white transition-all ${
                  loading ? "bg-[var(--accent-600)]/40 cursor-not-allowed" : "bg-[var(--accent-600)] hover:bg-[var(--accent-700)]"
                }`}
              >
                {loading ? "Please wait…" : "Update password"}
              </button>
            </form>
          )}
        </div>

        <p className="text-slate-600 text-[12px] text-center mt-6">AutoMark · AI-powered answer marking</p>
      </div>
    </div>
  );
}
