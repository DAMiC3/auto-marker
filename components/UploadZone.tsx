"use client";

import { useRef } from "react";

interface Props {
  label: string;
  sublabel: string;
  file: File | null;
  onFile: (f: File) => void;
  accent?: boolean;
}

export default function UploadZone({ label, sublabel, file, onFile, accent }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) onFile(dropped);
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className={`flex-1 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
        accent
          ? "border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50"
          : "border-slate-200 bg-slate-50 hover:bg-slate-100"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />

      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center ${
          accent ? "bg-indigo-100" : "bg-slate-200"
        }`}
      >
        <svg
          className={`w-5 h-5 ${accent ? "text-indigo-600" : "text-slate-500"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" />
        </svg>
      </div>

      {file ? (
        <>
          <p className={`text-[14px] font-semibold text-center ${accent ? "text-indigo-700" : "text-slate-700"}`}>
            {file.name}
          </p>
          <p className="text-[12px] text-slate-400">Click to replace</p>
        </>
      ) : (
        <>
          <p className={`text-[14px] font-semibold text-center ${accent ? "text-indigo-700" : "text-slate-700"}`}>
            {label}
          </p>
          <p className="text-[12px] text-slate-400 text-center">{sublabel}</p>
        </>
      )}
    </div>
  );
}
