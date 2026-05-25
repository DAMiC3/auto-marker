"use client";

const files = [
  { name: "Graad 8 — Afrikaans", active: true },
  { name: "Graad 9 — Afrikaans", active: false },
  { name: "Graad 10 — Afrikaans", active: false },
];

const recent = [
  "Wiskunde Toets — 8A",
  "Afr Opstel — 9B",
];

export default function Sidebar() {
  return (
    <aside className="w-[260px] shrink-0 flex flex-col h-full bg-[#0E1525]">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 bg-[#090E1A]">
        <div className="w-7 h-7 rounded-[7px] bg-indigo-600" />
        <span className="text-[#EFF4FE] font-bold text-base">AutoMark</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-5 flex flex-col gap-1 overflow-y-auto">
        <p className="text-[10px] font-semibold tracking-[1.5px] text-[#657BAA] px-2 mb-1">
          FILES
        </p>

        {files.map((f) => (
          <button
            key={f.name}
            className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors ${
              f.active
                ? "bg-indigo-600/20 text-[#EFF4FE] font-medium"
                : "text-[#9BAECC] hover:bg-white/5"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                f.active ? "bg-indigo-400" : "bg-[#657BAA]"
              }`}
            />
            {f.name}
          </button>
        ))}

        <div className="my-3 border-t border-white/[0.07]" />

        <p className="text-[10px] font-semibold tracking-[1.5px] text-[#657BAA] px-2 mb-1">
          RECENT
        </p>

        {recent.map((r) => (
          <button
            key={r}
            className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-[13px] text-[#9BAECC] hover:bg-white/5 transition-colors"
          >
            <span className="w-2 h-2 rounded-full shrink-0 bg-[#657BAA]" />
            {r}
          </button>
        ))}
      </nav>

      {/* User row */}
      <div className="px-3 pb-5">
        <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-white/[0.04]">
          <div className="w-8 h-8 rounded-full bg-indigo-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[#EFF4FE] truncate">
              Michael Bernard
            </p>
            <p className="text-[11px] text-[#657BAA]">Pro Plan · R500/mo</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
