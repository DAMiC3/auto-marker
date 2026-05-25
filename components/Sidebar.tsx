"use client";

import type { Folder } from "@/lib/fileSystem";

interface Props {
  folders: Folder[];
  activeFolder: string | null;
  connected: boolean;
  onConnect: () => void;
  onSelectFolder: (name: string) => void;
}

export default function Sidebar({
  folders,
  activeFolder,
  connected,
  onConnect,
  onSelectFolder,
}: Props) {
  return (
    <aside className="w-[260px] shrink-0 flex flex-col h-full bg-[#0E1525]">
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-5 bg-[#090E1A]">
        <div className="w-7 h-7 rounded-[7px] bg-[var(--accent-600)]" />
        <span className="text-[#EFF4FE] font-bold text-base">AutoMark</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-5 flex flex-col gap-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2 mb-1">
          <p className="text-[10px] font-semibold tracking-[1.5px] text-[#657BAA]">
            FILES
          </p>
          {connected && (
            <button
              onClick={onConnect}
              className="text-[10px] text-[#657BAA] hover:text-[#9BAECC] transition-colors"
              title="Connect a different folder"
            >
              change
            </button>
          )}
        </div>

        {!connected ? (
          <button
            onClick={onConnect}
            className="flex items-center gap-2 w-full text-left px-3 py-2.5 rounded-lg text-[13px] text-[#EFF4FE] bg-[var(--accent-600)]/20 hover:bg-[var(--accent-600)]/30 transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            Connect your files
          </button>
        ) : folders.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-[#657BAA]">
            No subfolders found in the connected folder.
          </p>
        ) : (
          folders.map((f) => {
            const active = f.name === activeFolder;
            return (
              <button
                key={f.name}
                onClick={() => onSelectFolder(f.name)}
                className={`flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-[13px] transition-colors ${
                  active
                    ? "bg-[var(--accent-600)]/20 text-[#EFF4FE] font-medium"
                    : "text-[#9BAECC] hover:bg-white/5"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    active ? "bg-[var(--accent-400)]" : "bg-[#657BAA]"
                  }`}
                />
                <span className="truncate">{f.name}</span>
              </button>
            );
          })
        )}
      </nav>

      {/* User row */}
      <div className="px-3 pb-5">
        <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-white/[0.04]">
          <div className="w-8 h-8 rounded-full bg-[var(--accent-600)] shrink-0" />
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
