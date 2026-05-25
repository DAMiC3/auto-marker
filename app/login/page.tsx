"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json();
      setError(data.error ?? "Incorrect password.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0E1525] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <span className="text-white text-[20px] font-bold tracking-tight">AutoMark</span>
        </div>

        {/* Card */}
        <div className="bg-[#161E2E] rounded-2xl border border-white/10 px-8 py-8">
          <h1 className="text-white text-[18px] font-semibold mb-1">Welcome back</h1>
          <p className="text-slate-400 text-[13px] mb-6">Enter your password to continue</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-xl px-4 py-3 text-[14px] outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
            />

            {error && (
              <p className="text-red-400 text-[13px]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className={`w-full rounded-xl py-3 font-semibold text-[14px] text-white transition-all ${
                loading || !password
                  ? "bg-indigo-600/40 cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {loading ? "Checking…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-slate-600 text-[12px] text-center mt-6">AutoMark · AI-powered answer marking</p>
      </div>
    </div>
  );
}
