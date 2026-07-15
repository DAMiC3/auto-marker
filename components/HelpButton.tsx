"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Props {
  onTakeTour: () => void;
  pulse: boolean;
}

// The persistent "?" help entry point (top-right of the header). Re-opens the
// guided tour or links to the best-practices page — the same two options offered
// by the first-login OnboardingPrompt, so help is never more than one click away.
export default function HelpButton({ onTakeTour, pulse }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative" data-tour="help">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Help"
        className={`relative w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-bold border transition-colors ${
          open
            ? "bg-[var(--accent-600)] text-white border-[var(--accent-600)]"
            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
        }`}
      >
        {pulse && <span className="absolute inset-0 rounded-full bg-[var(--accent-500)] animate-ping" />}
        <span className="relative">?</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label="Help"
            className="absolute right-0 top-11 z-30 w-64 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onTakeTour();
              }}
              className="flex items-center gap-2.5 w-full text-left px-4 py-3 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Take the guided tour
            </button>
            <Link
              href="/best-practices"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 w-full text-left px-4 py-3 text-[13px] text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
            >
              Best practices guide
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
