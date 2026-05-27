"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  onAddOption: (v: string) => void;
}

export default function SubjectCombobox({ options, value, onChange, onAddOption }: Props) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const trimmed  = query.trim();
  const filtered = options.filter((o) => o.toLowerCase().includes(trimmed.toLowerCase()));
  const canAdd   = trimmed.length > 0 && !options.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  function pick(v: string) {
    onChange(v);
    setQuery("");
    setOpen(false);
  }

  function add() {
    if (!canAdd) return;
    onAddOption(trimmed);
    onChange(trimmed);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] bg-white outline-none focus:border-[var(--accent-500)] transition-colors"
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>
          {value || "Select a subject…"}
        </span>
        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); canAdd ? add() : (filtered[0] && pick(filtered[0])); } }}
              placeholder="Search or add a subject…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-[var(--accent-500)]"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => pick(o)}
                className={`w-full text-left px-4 py-2 text-[13px] hover:bg-slate-50 transition-colors ${
                  o === value ? "text-[var(--accent-600)] font-medium" : "text-slate-700"
                }`}
              >
                {o}
              </button>
            ))}
            {canAdd && (
              <button
                type="button"
                onClick={add}
                className="w-full text-left px-4 py-2 text-[13px] text-[var(--accent-600)] hover:bg-[var(--accent-50)] transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add “{trimmed}”
              </button>
            )}
            {filtered.length === 0 && !canAdd && (
              <p className="px-4 py-2 text-[13px] text-slate-400">No subjects</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
