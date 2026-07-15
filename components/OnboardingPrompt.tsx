"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onTakeTour: () => void;
  onBestPractices: () => void;
  onJustExplore: () => void;
}

// Shown once, on first login (see lib/onboarding.ts). Offers three paths: a guided
// tour, the best-practices page, or dismiss — the dismiss path visibly "seeps" the
// card toward the top-right "?" help button so that button registers as *the* place
// to find help later, rather than just vanishing.
export default function OnboardingPrompt({ open, onTakeTour, onBestPractices, onJustExplore }: Props) {
  const [exiting, setExiting] = useState(false);

  if (!open) return null;

  function handleJustExplore() {
    setExiting(true);
    setTimeout(onJustExplore, 420);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div
        className={`bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-7 transition-all duration-[420ms] ease-in ${
          exiting
            ? "opacity-0 scale-[0.15] -translate-y-[42vh] translate-x-[42vw]"
            : "opacity-100 scale-100 translate-y-0 translate-x-0"
        }`}
      >
        <div className="w-11 h-11 rounded-xl bg-[var(--accent-50)] flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-[18px] font-semibold text-slate-900">Welcome to AutoMark</h2>
        <p className="text-[14px] text-slate-500 mt-1.5">
          Would you like a hand finding your way around, or do you already know what you’re doing?
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onTakeTour}
            className="w-full text-left rounded-xl border border-[var(--accent-500)] bg-[var(--accent-50)] px-4 py-3.5 hover:bg-[var(--accent-100)] transition-colors"
          >
            <span className="block text-[14px] font-semibold text-slate-900">Show me around</span>
            <span className="block text-[12.5px] text-slate-500 mt-0.5">
              A quick guided tour — we’ll point out what each part of the screen does.
            </span>
          </button>
          <button
            type="button"
            onClick={onBestPractices}
            className="w-full text-left rounded-xl border border-slate-200 px-4 py-3.5 hover:bg-slate-50 transition-colors"
          >
            <span className="block text-[14px] font-semibold text-slate-900">Show me best practices instead</span>
            <span className="block text-[12.5px] text-slate-500 mt-0.5">
              Tips on writing memos, batching, and saving your allowance.
            </span>
          </button>
          <button
            type="button"
            onClick={handleJustExplore}
            className="w-full text-left rounded-xl border border-slate-200 px-4 py-3.5 hover:bg-slate-50 transition-colors"
          >
            <span className="block text-[14px] font-semibold text-slate-900">I’ll just explore</span>
            <span className="block text-[12.5px] text-slate-500 mt-0.5">
              Help stays one click away at the “?” button, top right.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
