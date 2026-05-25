"use client";

interface Props {
  value: number;
  onChange: (v: number) => void;
}

export default function StrictnessSlider({ value, onChange }: Props) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 px-7 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold text-slate-900">
          Marking Strictness
        </h2>
        <span className="text-[13px] font-bold text-[var(--accent-600)] bg-[var(--accent-50)] px-3 py-1 rounded-full">
          {value} / 10
        </span>
      </div>

      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[var(--accent-600)] bg-slate-200"
      />

      <div className="flex justify-between mt-2">
        <span className="text-[12px] text-slate-400">Lenient</span>
        <span className="text-[12px] text-slate-400">Strict</span>
      </div>
    </div>
  );
}
