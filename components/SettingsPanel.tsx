"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MarkShapeIcon, { type MarkShape, MARK_SHAPES } from "@/components/MarkShapeIcon";

export interface MarkType {
  id: string;
  label: string;
  abbrev: string;
  color: string;
  shape: MarkShape;
}

export interface Profile {
  name: string;
  subject: string;
}

export type MarkingQuality = "standard" | "high";

export interface Settings {
  defaultStrictness: number;
  accent: string; // tailwind color key, e.g. "indigo"
  profile: Profile;
  markTypes: MarkType[];
  markingQuality: MarkingQuality;
}

// Standard exam-marking mark types (M/A/B/E/FT/C), as used by e-marking tools
// and exam-board mark schemes. Each gets a default colour the user can change.
export const DEFAULT_MARK_TYPES: MarkType[] = [
  { id: "full",          label: "Full mark",        abbrev: "M",  color: "#16A34A", shape: "tick" },
  { id: "half",          label: "Half mark",        abbrev: "½",  color: "#16A34A", shape: "half" },
  { id: "accuracy",      label: "Accuracy mark",    abbrev: "A",  color: "#2563EB", shape: "tick" },
  { id: "incorrect",     label: "Incorrect",        abbrev: "✗",  color: "#DC2626", shape: "cross" },
  { id: "explanation",   label: "Explanation mark", abbrev: "E",  color: "#D97706", shape: "circle" },
  { id: "followthrough", label: "Follow-through",   abbrev: "FT", color: "#0891B2", shape: "underline" },
];

export const DEFAULT_SETTINGS: Settings = {
  defaultStrictness: 7,
  accent: "indigo",
  profile: { name: "Michael Bernard", subject: "English" },
  markTypes: DEFAULT_MARK_TYPES,
  markingQuality: "standard",
};

const ACCENTS: { key: string; label: string; swatch: string }[] = [
  { key: "indigo",  label: "Indigo",  swatch: "#4F46E5" },
  { key: "violet",  label: "Violet",  swatch: "#7C3AED" },
  { key: "emerald", label: "Emerald", swatch: "#059669" },
  { key: "rose",    label: "Rose",    swatch: "#E11D48" },
  { key: "amber",   label: "Amber",   swatch: "#D97706" },
];

const STORAGE_KEY = "automark.settings";

export function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      profile:   { ...DEFAULT_SETTINGS.profile, ...(parsed.profile ?? {}) },
      markTypes: (parsed.markTypes && parsed.markTypes.length > 0 ? parsed.markTypes : DEFAULT_MARK_TYPES)
        .map((m) => ({ ...m, shape: (m.shape ?? "tick") as MarkShape })),
      markingQuality: parsed.markingQuality ?? DEFAULT_SETTINGS.markingQuality,
    };
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
  const [profile, setProfile]       = useState<Profile>(initial.profile);
  const [markTypes, setMarkTypes]   = useState<MarkType[]>(initial.markTypes);
  const [quality, setQuality]       = useState<MarkingQuality>(initial.markingQuality);

  // Re-sync when reopened
  useEffect(() => {
    if (open) {
      setStrictness(initial.defaultStrictness);
      setAccent(initial.accent);
      setProfile(initial.profile);
      setMarkTypes(initial.markTypes);
      setQuality(initial.markingQuality);
    }
  }, [open, initial]);

  if (!open) return null;

  function updateMark(id: string, patch: Partial<MarkType>) {
    setMarkTypes((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function removeMark(id: string) {
    setMarkTypes((prev) => prev.filter((m) => m.id !== id));
  }

  function addMark() {
    setMarkTypes((prev) => [
      ...prev,
      { id: `mark-${Date.now()}`, label: "New mark", abbrev: "", color: "#64748B", shape: "tick" },
    ]);
  }

  function handleSave() {
    const next: Settings = { defaultStrictness: strictness, accent, profile, markTypes, markingQuality: quality };
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
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

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
          {/* Profile */}
          <section>
            <h3 className="text-[14px] font-semibold text-slate-800 mb-3">Profile</h3>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-medium text-slate-500 mb-1.5">Display name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] text-slate-800 outline-none focus:border-[var(--accent-500)]"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-slate-500 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={profile.subject}
                  onChange={(e) => setProfile({ ...profile, subject: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] text-slate-800 outline-none focus:border-[var(--accent-500)]"
                />
              </div>
            </div>
          </section>

          {/* Default strictness */}
          <section className="border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-slate-800">Default marking strictness</h3>
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
          </section>

          {/* Marking engine (model tier — names intentionally hidden) */}
          <section className="border-t border-slate-100 pt-6">
            <h3 className="text-[14px] font-semibold text-slate-800 mb-1">Marking engine</h3>
            <p className="text-[12px] text-slate-400 mb-3">
              Choose how thorough the AI is. Higher accuracy uses more of your allowance.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: "standard", title: "Standard", desc: "Fast and efficient. Great for most marking." },
                { key: "high",     title: "High accuracy", desc: "Most thorough judgment for tricky or high-stakes papers." },
              ] as { key: MarkingQuality; title: string; desc: string }[]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setQuality(opt.key)}
                  className={`text-left rounded-xl border p-4 transition-colors ${
                    quality === opt.key
                      ? "border-[var(--accent-500)] bg-[var(--accent-50)]"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-semibold text-slate-800">{opt.title}</span>
                    {quality === opt.key && (
                      <svg className="w-4 h-4 text-[var(--accent-600)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-[12px] text-slate-500 leading-snug block">{opt.desc}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Mark types */}
          <section className="border-t border-slate-100 pt-6">
            <h3 className="text-[14px] font-semibold text-slate-800 mb-1">Mark types</h3>
            <p className="text-[12px] text-slate-400 mb-4">
              The kinds of marks you allocate, each with its own colour for annotations.
            </p>

            <div className="flex flex-col gap-3">
              {markTypes.map((m) => (
                <div key={m.id} className="rounded-xl border border-slate-200 p-3 flex flex-col gap-3">
                  {/* Top row: shape preview + colour + abbrev + label + remove */}
                  <div className="flex items-center gap-2.5">
                    {/* Live preview of the mark */}
                    <span className="shrink-0 w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                      <MarkShapeIcon shape={m.shape} color={m.color} size={20} />
                    </span>

                    {/* Colour picker */}
                    <label className="relative shrink-0 cursor-pointer" title="Choose colour">
                      <span className="block w-9 h-9 rounded-lg border border-slate-200" style={{ backgroundColor: m.color }} />
                      <input
                        type="color"
                        value={m.color}
                        onChange={(e) => updateMark(m.id, { color: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </label>

                    {/* Abbreviation */}
                    <input
                      type="text"
                      value={m.abbrev}
                      maxLength={3}
                      onChange={(e) => updateMark(m.id, { abbrev: e.target.value })}
                      placeholder="—"
                      className="w-12 text-center rounded-lg border border-slate-200 px-2 py-2 text-[13px] font-bold text-slate-800 outline-none focus:border-[var(--accent-500)]"
                    />

                    {/* Label */}
                    <input
                      type="text"
                      value={m.label}
                      onChange={(e) => updateMark(m.id, { label: e.target.value })}
                      className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 outline-none focus:border-[var(--accent-500)]"
                    />

                    {/* Remove */}
                    <button
                      onClick={() => removeMark(m.id)}
                      className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Remove"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Shape picker */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400 mr-1">Shape</span>
                    {MARK_SHAPES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => updateMark(m.id, { shape: s.key })}
                        title={s.label}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-colors ${
                          m.shape === s.key
                            ? "border-[var(--accent-500)] bg-[var(--accent-50)]"
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <MarkShapeIcon shape={s.key} color={m.shape === s.key ? m.color : "#94A3B8"} size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addMark}
              className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent-600)] hover:text-[var(--accent-700)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add mark type
            </button>
          </section>

          {/* Accent color */}
          <section className="border-t border-slate-100 pt-6">
            <h3 className="text-[14px] font-semibold text-slate-800 mb-3">Accent color</h3>
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
          </section>

          {/* Account */}
          <section className="border-t border-slate-100 pt-6">
            <h3 className="text-[14px] font-semibold text-slate-800 mb-3">Account</h3>
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
