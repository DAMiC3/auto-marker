"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface Settings {
  defaultStrictness: number;
  accent: string; // tailwind color key, e.g. "indigo"
}

export const DEFAULT_SETTINGS: Settings = {
  defaultStrictness: 7,
  accent: "indigo",
};

const ACCENTS: { key: string; label: string; swatch: string }[] = [
  { key: "indigo",   label: "Indigo",  swatch: "#4F46E5" },
  { key: "violet",   label: "Violet",  swatch: "#7C3AED" },
  { key: "emerald",  label: "Emerald", swatch: "#059669" },
  { key: "rose",     label: "Rose",    swatch: "#E11D48" },
  { key: "amber",    label: "Amber",   swatch: "#D97706" },
];

const STORAGE_KEY = "automark.settings";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (s: Settings) => void;
  initial: Settings;
}

export default function SettingsPanel({ open, onClose, onSave, initial }: Props) {
  const router = useRouter();
  const [strictness, setStrictness] = useState(initial.defaultStrictness);
  const [accent, setAccent]         = useState(initial.accent);

  // Re-sync when reopened
  useEffect(() => {
    if (open) {
      setStrictness(initial.defaultStrictness);
      setAccent(initial.accent);
    }
  }, [open, initial]);

  if (!open) return null;

  function handleSave() {
    const next: Settings = { defaultStrictness: strictness, accent };
    saveSettings(next);
    document.documentElement.dataset.accent = accent;
    onSave(next);
    onClose();
  }

  async function handleSignOut() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col animate-[slidein_0.2s_ease-out]">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 shrink-0">
          <h2 className="text-[16px] font-semibold text-slate-900">Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-8">
          {/* Default strictness */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[14px] font-semibold text-slate-800">
                Default marking strictness
              </label>
              <span className="text-[13px] font-bold text-[var(--accent-600)] bg-[var(--accent-50)] px-3 py-1 rounded-full">
                {strictness} / 10
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={strictness}
              onChange={(e) => setStrictness(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent-600)] bg-slate-200"
            />
            <div className="flex justify-between mt-2">
              <span className="text-[12px] text-slate-400">Lenient</span>
              <span className="text-[12px] text-slate-400">Strict</span>
            </div>
            <p className="text-[12px] text-slate-400 mt-2">
              New batches start at this level.
            </p>
          </section>

          {/* Accent color */}
          <section>
            <label className="text-[14px] font-semibold text-slate-800 block mb-3">
              Accent color
            </label>
            <div className="flex gap-3">
              {ACCENTS.map((a) => (
                <button
                  key={a.key}
                  onClick={() => setAccent(a.key)}
                  className={`w-10 h-10 rounded-full transition-transform ${
                    accent === a.key ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: a.swatch }}
                  title={a.label}
                  aria-label={a.label}
                />
              ))}
            </div>
            <p className="text-[12px] text-slate-400 mt-3">
              Used for buttons and highlights across the app.
            </p>
          </section>

          {/* Account */}
          <section className="border-t border-slate-100 pt-6">
            <label className="text-[14px] font-semibold text-slate-800 block mb-3">
              Account
            </label>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-3 rounded-xl border border-red-200 text-red-600 text-[14px] font-medium hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-3 text-[14px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 rounded-xl py-3 text-[14px] font-semibold text-white bg-[var(--accent-600)] hover:bg-[var(--accent-700)] transition-colors"
          >
            Save changes
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes slidein {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
