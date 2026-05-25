"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import StrictnessSlider from "@/components/StrictnessSlider";
import SettingsPanel, { type Settings, DEFAULT_SETTINGS, loadSettings } from "@/components/SettingsPanel";
import {
  type Folder,
  type FileEntry,
  isSupported,
  pickRoot,
  loadSavedRoot,
  hasPermission,
  ensurePermission,
  listFolders,
  listFiles,
  moveFile,
  writeFile,
  pickFile,
} from "@/lib/fileSystem";
import { markPaper, extractMemoText } from "@/lib/markPaper";

interface BatchResult {
  name: string;
  total: number;
  available: number;
  percentage: number;
  moved?: boolean;
}

export default function Home() {
  const [strictness, setStrictness] = useState(7);
  const [settings, setSettings]     = useState<Settings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── File system state ──────────────────────────────────────────────────
  // Assume supported during SSR/first render to avoid a hydration mismatch;
  // the real check runs after mount.
  const [mounted, setMounted]     = useState(false);
  const [supported, setSupported] = useState(true);
  const [root, setRoot]       = useState<FileSystemDirectoryHandle | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [fromName, setFromName] = useState<string | null>(null);
  const [toName, setToName]     = useState<string | null>(null);
  const [files, setFiles]       = useState<FileEntry[]>([]);

  const [memoFile, setMemoFile] = useState<File | null>(null);
  const [memoText, setMemoText] = useState("");

  const [busy, setBusy]         = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [message, setMessage]   = useState<string | null>(null);
  const [results, setResults]   = useState<BatchResult[]>([]);

  // Load saved settings on mount and seed default strictness
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setStrictness(s.defaultStrictness);
  }, []);

  // Detect support after mount (avoids SSR/client mismatch)
  useEffect(() => {
    setMounted(true);
    setSupported(isSupported());
  }, []);

  // Try to silently reconnect to a previously chosen folder
  useEffect(() => {
    (async () => {
      if (!isSupported()) return;
      const saved = await loadSavedRoot();
      if (saved && (await hasPermission(saved))) {
        setRoot(saved);
        setFolders(await listFolders(saved));
      }
    })().catch(() => {});
  }, []);

  // Connect (or change) the workspace folder — needs a user gesture
  const handleConnect = useCallback(async () => {
    setError(null);
    setMessage(null);
    try {
      const handle = await pickRoot();
      if (!(await ensurePermission(handle))) {
        setError("Permission to access the folder was not granted.");
        return;
      }
      setRoot(handle);
      setFolders(await listFolders(handle));
      setFromName(null);
      setToName(null);
      setFiles([]);
    } catch (e: unknown) {
      // User cancelling the picker throws — ignore that case quietly
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Could not open the folder.");
    }
  }, []);

  // Load documents whenever the "From" folder changes
  useEffect(() => {
    (async () => {
      const folder = folders.find((f) => f.name === fromName);
      if (!folder) { setFiles([]); return; }
      setFiles(await listFiles(folder.handle));
    })().catch((e) => setError(e instanceof Error ? e.message : "Could not read folder."));
  }, [fromName, folders]);

  const fromFolder = folders.find((f) => f.name === fromName);
  const toFolder   = folders.find((f) => f.name === toName);
  const canMark    = !!fromFolder && !!toFolder && fromName !== toName && files.length > 0 && !busy;

  async function handleChooseMemo() {
    const file = await pickFile();
    if (!file) return;
    setMemoFile(file);
    setError(null);
    try {
      setMemoText(await extractMemoText(file));
    } catch {
      setMemoText("");
    }
  }

  async function handleMark() {
    if (!fromFolder || !toFolder || !canMark) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setResults([]);

    const batch = [...files];
    const done: BatchResult[] = [];

    try {
      for (let i = 0; i < batch.length; i++) {
        const entry = batch[i];
        setProgress(`Marking ${i + 1} of ${batch.length}: ${entry.name}`);

        if (entry.name.toLowerCase().endsWith(".pdf")) {
          const file    = await entry.handle.getFile();
          const outcome = await markPaper(file, memoText, strictness, settings.markTypes);
          const marked  = entry.name.replace(/\.pdf$/i, "") + " (marked).pdf";
          await writeFile(toFolder.handle, marked, outcome.bytes);
          await fromFolder.handle.removeEntry(entry.name);
          done.push({ name: marked, total: outcome.total, available: outcome.available, percentage: outcome.percentage });
        } else {
          // Non-PDF documents are just moved across (can't be stamped)
          await moveFile(entry.name, fromFolder.handle, toFolder.handle);
          done.push({ name: entry.name, total: 0, available: 0, percentage: 0, moved: true });
        }
      }

      setFiles(await listFiles(fromFolder.handle));
      setResults(done);
      const markedCount = done.filter((d) => !d.moved).length;
      setMessage(`Done. Marked ${markedCount} paper${markedCount === 1 ? "" : "s"} and moved everything to “${toName}”.`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Marking failed.");
      setFiles(await listFiles(fromFolder.handle).catch(() => files));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex h-full bg-[#F3F6FB]">
      <Sidebar
        folders={folders}
        activeFolder={fromName}
        connected={!!root}
        profileName={settings.profile.name}
        profileSubject={settings.profile.subject}
        onConnect={handleConnect}
        onSelectFolder={setFromName}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 shrink-0">
          <h1 className="text-[18px] font-semibold text-slate-900">Mark New Batch</h1>
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto px-8 py-8 flex flex-col gap-6">

          <StrictnessSlider value={strictness} onChange={setStrictness} />

          {/* Not supported notice */}
          {mounted && !supported && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-5 py-4 text-[14px]">
              Your browser doesn’t support direct folder access. Use Chrome or Edge to connect your files.
            </div>
          )}

          {/* Files workspace */}
          {supported && (
            <div className="bg-white rounded-2xl border border-slate-200 px-7 py-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-[15px] font-semibold text-slate-900">Files</h2>
                {!root && (
                  <button
                    onClick={handleConnect}
                    className="px-4 py-2 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-[13px] font-medium transition-colors"
                  >
                    Connect your files
                  </button>
                )}
              </div>

              {!root ? (
                <p className="text-[14px] text-slate-500">
                  Connect a folder on your computer to get started. Subfolders inside it
                  become your classes — pick where documents come <em>from</em> and where
                  they go <em>to</em>, then hit Mark.
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  {/* From / To selectors */}
                  <div className="flex items-end gap-4">
                    <div className="flex-1">
                      <label className="block text-[12px] font-medium text-slate-500 mb-1.5">From folder</label>
                      <select
                        value={fromName ?? ""}
                        onChange={(e) => setFromName(e.target.value || null)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] text-slate-800 bg-white outline-none focus:border-[var(--accent-500)]"
                      >
                        <option value="">Select…</option>
                        {folders.map((f) => (
                          <option key={f.name} value={f.name}>{f.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="shrink-0 pb-2.5">
                      <svg className="w-6 h-6 text-[var(--accent-400)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>

                    <div className="flex-1">
                      <label className="block text-[12px] font-medium text-slate-500 mb-1.5">To folder</label>
                      <select
                        value={toName ?? ""}
                        onChange={(e) => setToName(e.target.value || null)}
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] text-slate-800 bg-white outline-none focus:border-[var(--accent-500)]"
                      >
                        <option value="">Select…</option>
                        {folders.map((f) => (
                          <option key={f.name} value={f.name} disabled={f.name === fromName}>{f.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Memo / answer key */}
                  <div>
                    <label className="block text-[12px] font-medium text-slate-500 mb-1.5">Memo (answer key)</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleChooseMemo}
                        className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-medium transition-colors"
                      >
                        {memoFile ? "Change memo" : "Choose memo"}
                      </button>
                      <span className="text-[13px] text-slate-500 truncate">
                        {memoFile ? memoFile.name : "No memo selected — the AI marks from general knowledge."}
                      </span>
                    </div>
                  </div>

                  {/* Document list in the From folder */}
                  <div>
                    <p className="text-[12px] font-medium text-slate-500 mb-2">
                      Documents in {fromName ? `“${fromName}”` : "the selected folder"}
                      {fromFolder && ` (${files.length})`}
                    </p>
                    {!fromFolder ? (
                      <p className="text-[13px] text-slate-400">Pick a “From” folder to see its documents.</p>
                    ) : files.length === 0 ? (
                      <p className="text-[13px] text-slate-400">This folder has no documents.</p>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                        {files.map((f) => (
                          <div key={f.name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 text-[13px] text-slate-700">
                            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="truncate">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error / success banners */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-[14px]">
              {error}
            </div>
          )}
          {message && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-5 py-4 text-[14px]">
              {message}
            </div>
          )}

          {/* Mark button — AI marks each paper, then moves it to the To folder */}
          <button
            onClick={handleMark}
            disabled={!canMark}
            className={`w-full rounded-2xl py-5 flex flex-col items-center gap-1 font-bold text-[18px] text-white transition-all ${
              canMark
                ? "bg-[var(--accent-600)] hover:bg-[var(--accent-700)] shadow-lg shadow-[color:var(--accent-100)]"
                : "bg-slate-300 cursor-not-allowed"
            }`}
          >
            {busy ? (
              <>
                <span>Marking…</span>
                <span className="text-[13px] font-normal opacity-70">{progress ?? "Working through the papers"}</span>
              </>
            ) : (
              <>
                <span>Mark ▶</span>
                <span className="text-[13px] font-normal opacity-70">
                  {canMark
                    ? `Mark ${files.length} paper${files.length === 1 ? "" : "s"} → “${toName}”`
                    : "Pick a From and To folder"}
                </span>
              </>
            )}
          </button>

          {/* Results summary */}
          {results.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 px-7 py-6 flex flex-col gap-3">
              <h2 className="text-[15px] font-semibold text-slate-900">Results</h2>
              {results.map((r) => (
                <div key={r.name} className="flex items-center justify-between border border-slate-100 rounded-xl px-4 py-3">
                  <span className="text-[13px] text-slate-700 truncate mr-3">{r.name}</span>
                  {r.moved ? (
                    <span className="text-[12px] text-slate-400 shrink-0">moved</span>
                  ) : (
                    <span
                      className={`text-[13px] font-bold px-3 py-1 rounded-full shrink-0 ${
                        r.percentage >= 70 ? "bg-green-50 text-green-600"
                        : r.percentage >= 50 ? "bg-amber-50 text-amber-600"
                        : "bg-red-50 text-red-600"
                      }`}
                    >
                      {r.total}/{r.available} · {r.percentage}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Settings slide-over */}
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initial={settings}
        onSave={(s) => {
          setSettings(s);
          setStrictness(s.defaultStrictness);
        }}
      />
    </div>
  );
}
