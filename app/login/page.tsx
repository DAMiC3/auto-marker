"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode]         = useState<Mode>("signin");
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [notice, setNotice]     = useState("");
  const [loading, setLoading]   = useState(false);

  const configured = isSupabaseConfigured();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    if (!configured) {
      setError("Sign-in isn’t configured yet. Add your Supabase keys to continue.");
      setLoading(false);
      return;
    }

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
      return;
    }

    // sign up
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    if (data.session) {
      // Email confirmation disabled → signed in immediately
      router.push("/");
      router.refresh();
    } else {
      setNotice("Account created. Check your email to confirm, then sign in.");
      setMode("signin");
      setLoading(false);
    }
  }

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
          <h1 className="text-white text-[18px] font-semibold mb-1">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-slate-400 text-[13px] mb-6">
            {mode === "signin" ? "Sign in to continue" : "Start marking in minutes"}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[var(--accent-500)] focus:ring-1 focus:ring-[var(--accent-500)] transition"
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[var(--accent-500)] focus:ring-1 focus:ring-[var(--accent-500)] transition"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[var(--accent-500)] focus:ring-1 focus:ring-[var(--accent-500)] transition"
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
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }}
            className="mt-5 w-full text-center text-[13px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>

        <p className="text-slate-600 text-[12px] text-center mt-6">AutoMark · AI-powered answer marking</p>
      </div>
    </div>
  );
}
