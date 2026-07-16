"use client";

import { useEffect, useState } from "react";
import type { TourStep } from "@/lib/tourSteps";
import { STRUCTURE_PARENT, STRUCTURE_FROM, STRUCTURE_TO, STRUCTURE_MEMO } from "@/lib/fileSystem";

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
}

// The required folder layout, drawn as a little tree so a new user can SEE the shape
// their connected folder needs. Names match the structure the app creates + selects
// (lib/fileSystem.ts), so this diagram and "Create folder structure" stay in sync.
function FolderStructureDiagram() {
  const children: { name: string; caption: string }[] = [
    { name: STRUCTURE_FROM, caption: "papers to be marked go here" },
    { name: STRUCTURE_TO,   caption: "marked papers appear here" },
    { name: STRUCTURE_MEMO, caption: "keep your answer key here" },
  ];
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
      <div className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700">
        <FolderIcon className="w-4 h-4 text-[var(--accent-600)]" />
        <span>{STRUCTURE_PARENT}</span>
        <span className="text-[11px] font-normal text-slate-400">— the folder you connect</span>
      </div>
      <div className="mt-1.5 ml-2 border-l border-slate-200 pl-3 flex flex-col gap-1.5">
        {children.map((c) => (
          <div key={c.name} className="flex items-baseline gap-2">
            <FolderIcon className="w-3.5 h-3.5 text-slate-400 shrink-0 self-center" />
            <div className="min-w-0">
              <span className="text-[12.5px] font-medium text-slate-700">{c.name}</span>
              <span className="text-[11px] text-slate-400 ml-1.5">{c.caption}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Props {
  steps: TourStep[];
  active: boolean;
  onFinish: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 10;
const TOOLTIP_WIDTH = 300;

// A dependency-free spotlight walkthrough: dims everything except the current
// step's `data-tour="…"` target (four panels around it, so the target itself stays
// visually clear) and places an explanatory card next to it.
export default function GuidedTour({ steps, active, onFinish }: Props) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = steps[index];

  useEffect(() => {
    if (!active) setIndex(0);
  }, [active]);

  useEffect(() => {
    if (!active || !step) return;
    setRect(null);

    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return; // falls back to a centered card, see render below

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    function measure() {
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    const t = setTimeout(measure, 260); // let the smooth scroll settle first
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, step]);

  if (!active || !step) return null;

  const isLast = index === steps.length - 1;

  function next() {
    if (isLast) onFinish();
    else setIndex((i) => i + 1);
  }
  function back() {
    setIndex((i) => Math.max(0, i - 1));
  }

  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;

  const tooltipTop = rect
    ? rect.top + rect.height + 160 < viewportH
      ? rect.top + rect.height + PAD
      : Math.max(PAD, rect.top - 170)
    : null;

  return (
    // pointer-events-none on the container so clicks fall THROUGH the spotlight hole
    // to the real control underneath — the user can actually connect a folder, open
    // a select, etc. while the tour is up. The dimming panels and tooltip below
    // re-enable pointer events only where we want them (panels block, tooltip works).
    <div className="fixed inset-0 z-[60] pointer-events-none" role="dialog" aria-modal="true" aria-label="Guided tour">
      {rect ? (
        <>
          {/* Four dimming panels around the target — the target itself is left clear
              and clickable. Panels capture clicks (pointer-events-auto) so clicking
              the dimmed area doesn't accidentally hit the page behind it. */}
          <div className="fixed left-0 right-0 top-0 bg-black/55 pointer-events-auto" style={{ height: Math.max(0, rect.top - PAD) }} />
          <div className="fixed left-0 right-0 bg-black/55 pointer-events-auto" style={{ top: rect.top + rect.height + PAD, bottom: 0 }} />
          <div
            className="fixed left-0 bg-black/55 pointer-events-auto"
            style={{ top: Math.max(0, rect.top - PAD), height: rect.height + PAD * 2, width: Math.max(0, rect.left - PAD) }}
          />
          <div
            className="fixed right-0 bg-black/55 pointer-events-auto"
            style={{ top: Math.max(0, rect.top - PAD), height: rect.height + PAD * 2, left: rect.left + rect.width + PAD }}
          />
          <div
            className="fixed rounded-xl ring-2 ring-[var(--accent-500)] pointer-events-none transition-all duration-300"
            style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/55 pointer-events-auto" />
      )}

      <div
        className="fixed z-[61] bg-white rounded-2xl border border-slate-200 shadow-xl p-5 pointer-events-auto"
        style={
          rect
            ? { top: tooltipTop ?? 0, left: Math.min(Math.max(PAD, rect.left), viewportW - TOOLTIP_WIDTH - PAD), width: TOOLTIP_WIDTH }
            : { top: "40%", left: "50%", transform: "translate(-50%, -50%)", width: TOOLTIP_WIDTH }
        }
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-[var(--accent-600)]">
            Step {index + 1} of {steps.length}
          </span>
          <button type="button" onClick={onFinish} aria-label="Skip tour" className="text-slate-400 hover:text-slate-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <h3 className="text-[14.5px] font-semibold text-slate-900">{step.title}</h3>
        <p className="text-[13px] text-slate-500 mt-1 leading-relaxed">{step.body}</p>
        {step.visual === "folders" && <FolderStructureDiagram />}
        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={index === 0}
            className="text-[12.5px] font-medium text-slate-400 hover:text-slate-600 disabled:opacity-0 disabled:pointer-events-none"
          >
            Back
          </button>
          <button
            type="button"
            onClick={next}
            className="px-4 py-2 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-[13px] font-semibold transition-colors"
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
