"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";
import StrictnessSlider from "@/components/StrictnessSlider";
import UploadZone from "@/components/UploadZone";

interface MarkResult {
  score: number;
  total: number;
  percentage: number;
  feedback: { question: string; awarded: number; available: number; comment: string }[];
  strictnessUsed: number;
  reasoning: string;
}

export default function Home() {
  const [strictness, setStrictness] = useState(7);
  const [memo, setMemo] = useState<File | null>(null);
  const [answers, setAnswers] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canMark = memo !== null && answers !== null;

  async function handleMark() {
    if (!canMark) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("memo", memo);
      fd.append("answers", answers);
      fd.append("strictness", String(strictness));

      const res = await fetch("/api/mark", { method: "POST", body: fd });
      if (!res.ok) throw new Error((await res.json()).error ?? "Marking failed");
      setResult(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full bg-[#F3F6FB]">
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-[18px] font-semibold text-slate-900">
            Mark New Batch
          </h1>
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-[13px] font-medium hover:bg-slate-200 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto px-8 py-8 flex flex-col gap-6">

          {/* Strictness slider */}
          <StrictnessSlider value={strictness} onChange={setStrictness} />

          {/* Upload card */}
          <div className="bg-white rounded-2xl border border-slate-200 px-7 py-6">
            <h2 className="text-[15px] font-semibold text-slate-900 mb-5">
              Upload Files
            </h2>

            <div className="flex items-center gap-4">
              <UploadZone
                label="Upload Memo"
                sublabel="PDF, DOCX, TXT"
                file={memo}
                onFile={setMemo}
                accent
              />

              {/* Arrow */}
              <div className="shrink-0 flex items-center justify-center w-8">
                <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>

              <UploadZone
                label="Upload marked files here"
                sublabel="PDF, DOCX, TXT"
                file={answers}
                onFile={setAnswers}
              />
            </div>

            <div className="mt-3 text-right">
              <button className="text-[13px] text-indigo-500 hover:text-indigo-700 transition-colors">
                or choose from archive
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-[14px]">
              {error}
            </div>
          )}

          {/* MERK button */}
          <button
            onClick={handleMark}
            disabled={!canMark || loading}
            className={`w-full rounded-2xl py-5 flex flex-col items-center gap-1 font-bold text-[18px] text-white transition-all ${
              canMark && !loading
                ? "bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                : "bg-slate-300 cursor-not-allowed"
            }`}
          >
            {loading ? (
              <>
                <span>Marking…</span>
                <span className="text-[13px] font-normal opacity-70">This may take a moment</span>
              </>
            ) : (
              <>
                <span>MERK ▶</span>
                <span className="text-[13px] font-normal opacity-70">AI-powered marking</span>
              </>
            )}
          </button>

          {/* Results */}
          {result && (
            <div className="bg-white rounded-2xl border border-slate-200 px-7 py-6 flex flex-col gap-5">
              {/* Score banner */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] text-slate-500">Total Score</p>
                  <p className="text-[32px] font-bold text-slate-900">
                    {result.score}{" "}
                    <span className="text-[18px] font-normal text-slate-400">
                      / {result.total}
                    </span>
                  </p>
                </div>
                <div className={`text-[28px] font-bold px-5 py-3 rounded-xl ${
                  result.percentage >= 70
                    ? "bg-green-50 text-green-600"
                    : result.percentage >= 50
                    ? "bg-amber-50 text-amber-600"
                    : "bg-red-50 text-red-600"
                }`}>
                  {result.percentage}%
                </div>
              </div>

              {/* Feedback rows */}
              <div className="flex flex-col gap-3">
                {result.feedback.map((fb) => (
                  <div key={fb.question} className="border border-slate-100 rounded-xl px-5 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[14px] font-semibold text-slate-800">{fb.question}</span>
                      <span className="text-[13px] font-bold text-indigo-600">
                        {fb.awarded}/{fb.available}
                      </span>
                    </div>
                    <p className="text-[13px] text-slate-500">{fb.comment}</p>
                  </div>
                ))}
              </div>

              {/* Reasoning */}
              <div className="bg-slate-50 rounded-xl px-5 py-4">
                <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  AI Reasoning
                </p>
                <p className="text-[13px] text-slate-600">{result.reasoning}</p>
              </div>

              {/* Override note */}
              <p className="text-[12px] text-slate-400 text-center">
                Review marks above before finalising. You can override any score manually.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
