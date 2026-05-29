"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Folder } from "@/lib/fileSystem";
import { createClient } from "@/lib/supabase/client";
import AllowanceBar from "@/components/AllowanceBar";

interface Props {
  folders: Folder[];
  activeFolder: string | null;
  connected: boolean;
  profileName: string;
  profileSubject: string;
  onConnect: () => void;
  onSelectFolder: (name: string) => void;
  onOpenSettings: () => void;
}

export default function Sidebar({
  folders,
  activeFolder,
  connected,
  profileName,
  profileSubject,
  onConnect,
  onSelectFolder,
  onOpenSettings,
}: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCreed, setShowCreed] = useState(false);

  async function handleSignOut() {
    setMenuOpen(false);
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = profileName
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="w-[260px] shrink-0 flex flex-col h-full bg-[#0E1525]">
      {/* Logo */}
      <div className="relative h-16 flex items-center gap-3 px-5 bg-[#090E1A]">
        <div className="w-7 h-7 rounded-[7px] bg-[var(--accent-600)]" />
        <span className="text-[#EFF4FE] font-bold text-base">AutoMark</span>

        <button
          onClick={() => setShowCreed((v) => !v)}
          title="About"
          aria-label="About the maker"
          className="ml-0.5 text-[#657BAA] hover:text-[#EFF4FE] transition-colors"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 2h4v5h5v4h-5v11h-4V11H5V7h5z" />
          </svg>
        </button>

        {showCreed && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setShowCreed(false)} />
            <div className="absolute top-[58px] left-5 z-30 w-[210px] rounded-lg bg-[#161E2E] border border-white/10 px-3 py-2.5 text-[12px] leading-snug text-[#9BAECC] shadow-xl">
              This app was created by a Christian.
            </div>
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pt-5 flex flex-col gap-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2 mb-1">
          <p className="text-[10px] font-semibold tracking-[1.5px] text-[#657BAA]">FILES</p>
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

      {/* Allowance + user row + menu */}
      <div className="relative px-3 pb-5">
        <AllowanceBar />
        {menuOpen && (
          <>
            {/* click-away catcher */}
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-[72px] left-3 right-3 z-20 rounded-xl bg-[#161E2E] border border-white/10 shadow-xl overflow-hidden">
              <button
                onClick={() => { setMenuOpen(false); onOpenSettings(); }}
                className="flex items-center gap-2.5 w-full text-left px-4 py-3 text-[13px] text-[#EFF4FE] hover:bg-white/5 transition-colors"
              >
                <svg className="w-4 h-4 text-[#9BAECC]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2.5 w-full text-left px-4 py-3 text-[13px] text-red-300 hover:bg-white/5 transition-colors border-t border-white/[0.07]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </div>
          </>
        )}

        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-3 w-full px-3 py-3 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
        >
          <div className="w-8 h-8 rounded-full bg-[var(--accent-600)] shrink-0 flex items-center justify-center text-[11px] font-bold text-white">
            {initials || "U"}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="text-[13px] font-medium text-[#EFF4FE] truncate">{profileName}</p>
            <p className="text-[11px] text-[#657BAA] truncate">{profileSubject}</p>
          </div>
          <svg className="w-4 h-4 text-[#657BAA] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
