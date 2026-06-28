"use client";

import { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import StrictnessSlider from "@/components/StrictnessSlider";
import SettingsPanel, { type Settings, DEFAULT_SETTINGS, loadSettings, saveSettings } from "@/components/SettingsPanel";
import InstallButton from "@/components/InstallButton";
import PlanNotice from "@/components/PlanNotice";
import SubjectCombobox from "@/components/SubjectCombobox";
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
  writeFile,
  uniqueName,
  createMarkedFolder,
  pickFile,
} from "@/lib/fileSystem";
import { markInstant, preparePaper, stampPaper, extractMemoText, type PageContent } from "@/lib/markPaper";
import { type Memo, listMemos, saveMemo, deleteMemo } from "@/lib/memoArchive";
import type { Annotation } from "@/lib/markingPrompt";

type MarkMode = "instant" | "batch";

// Developer contact shown in the generic fallback error (P3-8).
const DEV_CONTACT_EMAIL = "bernardmanne3@gmail.com";
const GENERIC_ERROR =
  `An error occurred. Please try again later. If this keeps happening, ` +
  `please contact the developer at ${DEV_CONTACT_EMAIL}.`;

// Map a thrown error to a clear, user-facing message. Marking is fail-CLOSED:
// when a plan can't be verified (auth/DB error) the route blocks rather than mark
// blind, so the user must be told *why* nothing was marked — never a raw code.
// `recognized` is false for anything we have no specific message for — those are
// unexpected, so the caller shows GENERIC_ERROR and pages the founder (reportError).
function friendlyError(raw: string): { message: string; recognized: boolean } {
  const r = raw.toLowerCase();

  // Plan/auth gate codes (fail-closed).
  switch (raw) {
    case "allowance_exhausted":
      return { message: "You’ve used up your plan’s allowance. Buy another plan to keep marking.", recognized: true };
    case "verification_failed":
      return { message: "We couldn’t verify your plan just now (a temporary system error), so nothing was marked. Please try again in a moment — you weren’t charged.", recognized: true };
    case "not_authenticated":
      return { message: "Your session has expired. Please sign in again to keep marking.", recognized: true };
  }

  // Recognisable technical failures → plain language + a next step.
  if (r.includes("pdf") && /(invalid|corrupt|parse|structure|password|encrypted|malformed)/.test(r))
    return { message: "We couldn’t read one of the PDFs — it may be corrupted or password-protected. Re-save or re-export it and try again.", recognized: true };
  if (r.includes("max_tokens") || r.includes("too long") || r.includes("truncat"))
    return { message: "One of the papers was too long to mark in a single pass. Try splitting it into a smaller file and mark again.", recognized: true };
  if (r.includes("taking longer than expected"))
    return { message: raw, recognized: true }; // already a friendly batch-timeout sentence
  if (r.includes("failed to fetch") || r.includes("networkerror") || r.includes("network error") || r.includes("load failed"))
    return { message: "We couldn’t reach the server — check your internet connection and try again.", recognized: true };
  if (r.includes("batch submission failed") || r.includes("batch retrieval failed"))
    return { message: "The marking service didn’t respond just now. Please try again in a moment.", recognized: true };
  if (r.includes("permission") || r.includes("notallowed") || r.includes("not allowed"))
    return { message: "AutoMark doesn’t have permission to access that folder. Reconnect your files and allow access when prompted.", recognized: true };
  if (r.includes("quota") || r.includes("storage"))
    return { message: "Your device is out of free storage space, so the file couldn’t be saved. Free up some space and try again.", recognized: true };

  // Unknown → generic message; the caller alerts the founder via reportError.
  return { message: GENERIC_ERROR, recognized: false };
}

// Fire-and-forget founder alert for an *unexpected* error (P3-8). The /api/report-error
// route adds who hit it (from the session cookie) and pushes it via notifyOps
// (OPS_ALERT_WEBHOOK_URL). Never throws — reporting must not break the UI.
function reportError(detail: string, context: string) {
  try {
    void fetch("/api/report-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detail, context }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* swallow */ }
}

// Error codes that mean *no* paper can succeed — a plan/auth gate, not a problem
// with one paper. When marking hits one of these we abort the whole run (every
// remaining paper would fail the same way). Any *other* error is specific to a
// single paper, so we skip that paper and keep marking the rest (P2-3).
const FATAL_RUN_ERRORS = new Set(["allowance_exhausted", "verification_failed", "not_authenticated"]);

interface MarkResultLike {
  total: number;
  available: number;
  percentage: number;
  annotations: Annotation[];
  summary: string;
}

interface BatchResult {
  name: string;
  total: number;
  available: number;
  percentage: number;
  skipped?: boolean;   // non-PDF, left untouched in From (P2-8)
  failed?: boolean;
}

// P2-8: AutoMark only ever touches PDFs. Non-PDFs are left untouched in the From
// folder and listed as "skipped" — we never move files the user didn't ask us to mark.
function recordSkipped(others: FileEntry[], done: BatchResult[]) {
  for (const e of others) done.push({ name: e.name, total: 0, available: 0, percentage: 0, skipped: true });
}

// A PDF prepared for marking (pages extracted), carried through the batch/chunk loop.
interface PreparedDoc {
  customId: string;
  name: string;
  original: Uint8Array;
  pages: PageContent[];
}

// Pre-flight memory guard for batch prep (P2-5). A real browser OOM kills the tab
// with no catchable error, so we estimate the prepared payload as we go and stop
// *before* the tab dies. Prep happens before anything is submitted, charged, or
// moved, so bailing here is always safe. Typed PDFs are tiny (~tens of MB for 100);
// this only trips on image-heavy / scanned batches, where each page is a multi-MB
// base64 string. Conservative ceiling for a desktop Chrome/Edge tab.
const BATCH_MEMORY_BUDGET = 600 * 1024 * 1024; // ~600 MB of prepared payload

// Rough in-memory size of one prepared doc: the original PDF bytes plus each page's
// payload. Base64 image strings dominate; extracted text is negligible. JS strings
// are UTF-16, so a page string costs ~2 bytes per character.
function preparedBytes(d: PreparedDoc): number {
  let n = d.original.byteLength;
  for (const p of d.pages) n += (p.kind === "image" ? p.data.length : p.text.length) * 2;
  return n;
}

// Shown when a batch is too big to hold in browser memory — tells the user to split
// it into smaller runs (P2-5). `reached` is the 0-based index of the PDF that tipped
// it over (or failed to allocate).
function memoryGuardMessage(reached: number, total: number): string {
  return (
    `This batch is too large to process in your browser’s memory — it stopped while preparing ` +
    `PDF ${reached + 1} of ${total} (usually scanned or image-heavy PDFs, which are far bigger than ` +
    `typed ones). Nothing was marked, charged, or moved. Mark fewer PDFs at a time — split it into ` +
    `two or more smaller runs — and they’ll all go through.`
  );
}

// A batch run paused at the over-limit dialog (P1-4). Holds everything needed to
// resume as a chunked run if the user chooses "Mark in chunks".
interface ChunkCtx {
  from: Folder;
  to: Folder;
  prepared: PreparedDoc[];   // unmarked PDFs, in submission order
  others: FileEntry[];       // non-PDFs, left in place and reported as skipped (P2-8)
  quality: "standard" | "high";
  totalDocs: number;
}

// Outcome of a single batch-submit attempt.
type SubmitResult =
  | { kind: "submitted"; batchId: string; quality: string }
  | { kind: "over"; affordable: number }
  | { kind: "error"; code: string };

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

  // Memo archive
  const [memos, setMemos]                 = useState<Memo[]>([]);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);
  const memoText = memos.find((m) => m.id === selectedMemoId)?.text ?? "";

  // Subject + marking mode
  const [subject, setSubject] = useState("");
  const [mode, setMode]       = useState<MarkMode>("instant");

  const [busy, setBusy]         = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [message, setMessage]   = useState<string | null>(null);
  const [results, setResults]   = useState<BatchResult[]>([]);
  const [addingMemo, setAddingMemo] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Over-limit chunk dialog (P1-4). `chunkCtx` non-null ⇒ the modal is open and a
  // run is paused awaiting the user's choice; `chunkInfo` toggles the "more info" text.
  const [chunkCtx, setChunkCtx]   = useState<ChunkCtx | null>(null);
  const [chunkInfo, setChunkInfo] = useState(false);

  // Load saved settings on mount and seed default strictness
  useEffect(() => {
    const s = loadSettings();
    setSettings(s);
    setStrictness(s.defaultStrictness);
    setSubject(s.profile.subject || s.subjects[0] || "");
  }, []);

  // Add a new subject option and persist it
  function handleAddSubject(v: string) {
    setSettings((prev) => {
      if (prev.subjects.includes(v)) return prev;
      const next = { ...prev, subjects: [...prev.subjects, v] };
      saveSettings(next);
      return next;
    });
  }

  // Detect support after mount (avoids SSR/client mismatch)
  useEffect(() => {
    setMounted(true);
    setSupported(isSupported());
  }, []);

  // Load the memo archive on mount
  useEffect(() => {
    listMemos()
      .then((m) => {
        setMemos(m);
        if (m.length > 0) setSelectedMemoId((cur) => cur ?? m[0].id);
      })
      .catch(() => {});
  }, []);

  // Restore the last run's Results so a refresh doesn't blank the card (P3-5).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("automark.lastResults") || "null") as BatchResult[] | null;
      if (Array.isArray(saved) && saved.length > 0) setResults(saved);
    } catch { /* ignore malformed cache */ }
  }, []);

  // Auto-dismiss the banners so they don't linger; both are also manually dismissible (P3-5).
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 8000);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 15000);
    return () => clearTimeout(t);
  }, [error]);

  // Persist / clear the Results card across refreshes (P3-5).
  function persistResults(done: BatchResult[]) {
    try {
      if (done.length > 0) localStorage.setItem("automark.lastResults", JSON.stringify(done));
      else localStorage.removeItem("automark.lastResults");
    } catch { /* ignore quota / serialization errors */ }
  }

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
      setConnecting(true);
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
      const msg = e instanceof Error ? e.message : "Could not open the folder.";
      const fe = friendlyError(msg);
      setError(fe.message);
      if (!fe.recognized) reportError(msg, "connect");
    } finally {
      setConnecting(false);
    }
  }, []);

  // Load documents whenever the "From" folder changes
  useEffect(() => {
    (async () => {
      const folder = folders.find((f) => f.name === fromName);
      if (!folder) { setFiles([]); return; }
      setFiles(await listFiles(folder.handle));
    })().catch((e) => {
      const msg = e instanceof Error ? e.message : "Could not read folder.";
      const fe = friendlyError(msg);
      setError(fe.message);
      if (!fe.recognized) reportError(msg, "list-files");
    });
  }, [fromName, folders]);

  const fromFolder = folders.find((f) => f.name === fromName);
  const toFolder   = folders.find((f) => f.name === toName);
  // Single-flight (C10): no new run while busy OR while the chunk dialog is open.
  const canMark    = !!fromFolder && !!toFolder && fromName !== toName && files.length > 0 && !busy && !chunkCtx;

  // Create a fresh, empty "Marked <date>" folder and use it as the destination.
  // Guaranteed empty, so it always passes the destination-empty check on Mark.
  async function handleCreateMarkedFolder() {
    if (!root) return;
    setError(null);
    try {
      const folder = await createMarkedFolder(root);
      setFolders(await listFolders(root));
      setToName(folder.name);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not create a marked-documents folder.";
      const fe = friendlyError(msg);
      setError(fe.message);
      if (!fe.recognized) reportError(msg, "create-folder");
    }
  }

  async function handleAddMemo() {
    const file = await pickFile();
    if (!file) return;
    setError(null);
    setAddingMemo(true);
    try {
      const text = await extractMemoText(file).catch(() => "");
      const memo: Memo = { id: `memo-${Date.now()}`, name: file.name, addedAt: Date.now(), text, blob: file };
      await saveMemo(memo);
      const updated = await listMemos();
      setMemos(updated);
      setSelectedMemoId(memo.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not add memo.";
      const fe = friendlyError(msg);
      setError(fe.message);
      if (!fe.recognized) reportError(msg, "add-memo");
    } finally {
      setAddingMemo(false);
    }
  }

  async function handleDeleteMemo(id: string) {
    await deleteMemo(id);
    const updated = await listMemos();
    setMemos(updated);
    if (selectedMemoId === id) setSelectedMemoId(updated[0]?.id ?? null);
  }

  async function handleMark() {
    if (!fromFolder || !toFolder || !canMark) return;

    // The destination must start empty, so a run can never mix marked papers in
    // with — or silently overwrite — files that are already there.
    const existing = await listFiles(toFolder.handle).catch(() => [] as FileEntry[]);
    if (existing.length > 0) {
      setError(
        `The destination folder “${toName}” isn’t empty — it already contains ${existing.length} ` +
          `file${existing.length === 1 ? "" : "s"}. Empty it (or pick an empty folder) before marking, ` +
          `so marked papers don’t mix with or overwrite what’s already there.`
      );
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    setResults([]);
    persistResults([]);

    try {
      if (mode === "batch") await runBatch(fromFolder, toFolder);
      else await runInstant(fromFolder, toFolder);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Marking failed.";
      const fe = friendlyError(msg);
      setError(fe.message);
      if (!fe.recognized) reportError(msg, "marking");
      setFiles(await listFiles(fromFolder.handle).catch(() => files));
    } finally {
      setBusy(false);
      setProgress(null);
      window.dispatchEvent(new Event("allowance-refresh"));
    }
  }

  // ── Instant: mark each paper synchronously ───────────────────────────────
  async function runInstant(from: Folder, to: Folder) {
    const batch = [...files];
    const done: BatchResult[] = [];
    for (let i = 0; i < batch.length; i++) {
      const entry = batch[i];
      setProgress(`Marking ${i + 1} of ${batch.length}: ${entry.name}`);
      try {
        if (entry.name.toLowerCase().endsWith(".pdf")) {
          const file    = await entry.handle.getFile();
          const outcome = await markInstant(file, memoText, subject, strictness, settings.markTypes, settings.markingQuality);
          const marked  = await uniqueName(to.handle, entry.name.replace(/\.pdf$/i, "") + " (marked).pdf");
          await writeFile(to.handle, marked, outcome.bytes);
          if (!settings.keepOriginals) await from.handle.removeEntry(entry.name);
          done.push({ name: marked, total: outcome.total, available: outcome.available, percentage: outcome.percentage });
        } else {
          // Not a PDF → leave it where it is and report it (P2-8).
          done.push({ name: entry.name, total: 0, available: 0, percentage: 0, skipped: true });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Marking failed.";
        // Plan/auth gate failure → every remaining paper fails too. Abort the run.
        if (FATAL_RUN_ERRORS.has(msg)) throw e;
        // A failure specific to this paper (bad PDF, truncation, parse error…):
        // record it, leave the original untouched so it can be retried, and
        // keep marking the rest of the batch instead of aborting (P2-3).
        done.push({ name: entry.name, total: 0, available: 0, percentage: 0, failed: true });
      }
    }
    await finish(from, done, "Done");
  }

  // Count of papers actually marked (excludes skipped non-PDFs and failures).
  const markedCount = (d: BatchResult[]) => d.filter((x) => !x.skipped && !x.failed).length;

  // One batch-submit attempt. The route returns 402 + `affordable` when the set is
  // over budget (no batch is created in that case — nothing is sent to Anthropic).
  async function submitChunk(docs: PreparedDoc[], quality: "standard" | "high"): Promise<SubmitResult> {
    const res = await fetch("/api/mark/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memoText, subject, strictness, quality,
        markTypes: settings.markTypes.map((m) => ({ abbrev: m.abbrev, label: m.label, shape: m.shape })),
        papers: docs.map((p) => ({ customId: p.customId, pages: p.pages })),
      }),
    });
    if (res.ok) {
      const d = await res.json();
      return { kind: "submitted", batchId: d.batchId, quality: d.quality ?? quality };
    }
    const d = (await res.json().catch(() => ({}))) as { error?: string; affordable?: number; ref?: string };
    if (res.status === 402 && typeof d.affordable === "number") {
      return { kind: "over", affordable: d.affordable };
    }
    const msg = typeof d.error === "string" ? d.error : "Batch submission failed";
    return { kind: "error", code: d.ref ? `${msg} (ref: ${d.ref})` : msg };
  }

  // submitChunk with bounded retries on a *transient* failure (C12). Plan/auth gate
  // failures (FATAL_RUN_ERRORS) are never retried — they won't fix themselves.
  async function submitWithRetry(docs: PreparedDoc[], quality: "standard" | "high", tries = 2): Promise<SubmitResult> {
    let last: SubmitResult = { kind: "error", code: "Batch submission failed" };
    for (let i = 0; i <= tries; i++) {
      const r = await submitChunk(docs, quality);
      if (r.kind !== "error") return r;
      if (FATAL_RUN_ERRORS.has(r.code)) return r;
      last = r;
      if (i < tries) await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
    return last;
  }

  // Stamp + write + remove-original for one chunk's results.
  async function applyChunkResults(
    results: Record<string, MarkResultLike | { error: string }>,
    subset: PreparedDoc[],
    from: Folder,
    to: Folder,
    done: BatchResult[],
  ) {
    const byId = new Map(subset.map((p) => [p.customId, p]));
    for (const [cid, r] of Object.entries(results)) {
      const p = byId.get(cid);
      if (!p) continue;
      if ("error" in r) { done.push({ name: p.name, total: 0, available: 0, percentage: 0, failed: true }); continue; }
      const bytes  = await stampPaper(p.original, r.annotations ?? [], settings.markTypes, r.total ?? 0, r.available ?? 0, r.summary ?? "");
      const marked = await uniqueName(to.handle, p.name.replace(/\.pdf$/i, "") + " (marked).pdf");
      await writeFile(to.handle, marked, bytes);
      if (!settings.keepOriginals) await from.handle.removeEntry(p.name);
      done.push({ name: marked, total: r.total ?? 0, available: r.available ?? 0, percentage: r.percentage ?? 0 });
    }
  }

  // ── Batch: submit to the 50%-cheaper Batch API, then stamp ────────────────
  // If the whole job fits the allowance it's one batch (no dialog). If it's over
  // budget we pause and offer "Mark in chunks" (P1-4) rather than reject outright.
  async function runBatch(from: Folder, to: Folder) {
    const batch  = [...files];
    const pdfs    = batch.filter((e) => e.name.toLowerCase().endsWith(".pdf"));
    const others = batch.filter((e) => !e.name.toLowerCase().endsWith(".pdf"));
    const done: BatchResult[] = [];

    // No PDFs → nothing to mark; the non-PDFs are left in place (P2-8).
    if (pdfs.length === 0) {
      recordSkipped(others, done);
      await finish(from, done, "Batch done");
      return;
    }

    // Prepare every PDF (page extraction) up front, watching the running memory
    // footprint so a huge (usually scanned) batch can't silently OOM the tab (P2-5).
    const prepared: PreparedDoc[] = [];
    let usedBytes = 0;
    for (let i = 0; i < pdfs.length; i++) {
      setProgress(`Preparing ${i + 1} of ${pdfs.length}: ${pdfs[i].name}`);
      const file = await pdfs[i].handle.getFile();
      let doc: PreparedDoc;
      try {
        const { original, pages } = await preparePaper(file);
        doc = { customId: `p${i}`, name: pdfs[i].name, original, pages };
      } catch (e) {
        // An allocation failure mid-prep (RangeError: array buffer / string too long)
        // means we're already at the ceiling — surface the same friendly guidance.
        if (e instanceof RangeError) { setError(memoryGuardMessage(i, pdfs.length)); return; }
        throw e;
      }
      usedBytes += preparedBytes(doc);
      if (usedBytes > BATCH_MEMORY_BUDGET) {
        // Stop before preparing any more — nothing has been submitted/charged/moved yet.
        setError(memoryGuardMessage(i, pdfs.length));
        return;
      }
      prepared.push(doc);
    }

    // Probe the whole job. On an over-budget result the route creates NO batch —
    // it rejects at the estimate gate, so nothing is charged and nothing is moved yet.
    setProgress("Checking your allowance…");
    const probe = await submitWithRetry(prepared, settings.markingQuality);

    if (probe.kind === "error") throw new Error(probe.code);

    if (probe.kind === "over") {
      if (probe.affordable <= 0) {
        // Not even one document fits — straight block; nothing was moved or marked.
        setError(friendlyError("allowance_exhausted").message);
        return;
      }
      // Offer the choice. handleMark's finally clears `busy`; the modal owns the
      // screen and canMark is disabled while chunkCtx is set (single-flight, C10).
      setChunkCtx({ from, to, prepared, others, quality: settings.markingQuality, totalDocs: prepared.length });
      return;
    }

    // Whole job fit → one normal batch. Non-PDFs are left in place (P2-8).
    recordSkipped(others, done);
    const { results, recorded } = await pollBatch(probe.batchId, probe.quality);
    await applyChunkResults(results, prepared, from, to, done);
    if (!recorded) setError("Your papers are marked, but we couldn’t finish updating your usage just now — it’ll catch up shortly.");
    await finish(from, done, "Batch done");
  }

  // ── The automatic chunk loop (P1-4) ──────────────────────────────────────
  // Runs on its own once the user picks "Mark in chunks": size → submit → poll →
  // record → re-check → repeat, until the documents run out or the allowance does.
  // Obeys safety invariants C1–C16 (see docs/categories/01-payments-and-enforcement.md §11b).
  async function startChunkLoop() {
    const ctx = chunkCtx;
    if (!ctx) return;
    setChunkCtx(null);
    setChunkInfo(false);
    setBusy(true);
    setError(null);
    setMessage(null);
    setResults([]);
    persistResults([]);

    const { from, to, quality } = ctx;
    const done: BatchResult[] = [];
    let remaining = [...ctx.prepared];

    try {
      // Non-PDFs are left untouched in From and reported as skipped (P2-8).
      recordSkipped(ctx.others, done);

      let iterations = 0;
      const maxIterations = ctx.prepared.length + 1; // C3 backstop: each pass marks ≥1 doc

      while (remaining.length > 0) {
        if (++iterations > maxIterations) throw new Error("chunk_loop_runaway"); // C3

        setProgress(`Marking… ${markedCount(done)} of ${ctx.totalDocs} documents done`);

        // Ask how many of the remaining docs fit right now.
        const probe = await submitWithRetry(remaining, quality);
        let submitted: { batchId: string; quality: string };
        let chunkSize: number;

        if (probe.kind === "submitted") {
          submitted = probe;
          chunkSize = remaining.length;
        } else if (probe.kind === "over") {
          if (probe.affordable <= 0) { setError(friendlyError("allowance_exhausted").message); break; } // C1 stop
          chunkSize = probe.affordable;
          const sub = await submitWithRetry(remaining.slice(0, chunkSize), quality);
          if (sub.kind !== "submitted") {
            if (sub.kind === "over") { setError(friendlyError("allowance_exhausted").message); break; }
            throw new Error(sub.code);
          }
          submitted = sub;
        } else {
          throw new Error(probe.code); // C12 exhausted / C13 verification_failed
        }

        // C5: await completion AND the usage record before sizing the next chunk.
        const { results, recorded } = await pollBatch(submitted.batchId, submitted.quality);
        const chunkDocs = remaining.slice(0, chunkSize);
        await applyChunkResults(results, chunkDocs, from, to, done);
        remaining = remaining.slice(chunkSize); // C7: advance only after applying
        window.dispatchEvent(new Event("allowance-refresh"));

        // C6: a failed usage write leaves used_zar stale — we can no longer size the
        // next chunk safely, so stop. The parked write reconciles later (Problem 8).
        if (!recorded) {
          setError("We couldn’t update your usage after that batch, so marking stopped to stay safe. The papers already marked are saved — please try the rest again in a minute.");
          break;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Marking failed.";
      if (msg === "chunk_loop_runaway") {
        setError("Marking stopped unexpectedly. Some papers may be done — please check the folder and retry the rest.");
        reportError(msg, "chunk-loop"); // a safety-invariant trip — shouldn't happen, so page the founder
      } else {
        const fe = friendlyError(msg);
        setError(fe.message);
        if (!fe.recognized) reportError(msg, "chunk-loop");
      }
    } finally {
      setFiles(await listFiles(from.handle).catch(() => files));
      setResults(done);
      persistResults(done);
      const marked = markedCount(done);
      const leftover = remaining.length;
      if (leftover > 0) {
        setMessage(`Marked ${marked} of ${ctx.totalDocs} document${ctx.totalDocs === 1 ? "" : "s"}. The remaining ${leftover} ${leftover === 1 ? "is" : "are"} still in “${fromName}” — renew your plan to finish ${leftover === 1 ? "it" : "them"}.`);
      } else {
        setMessage(`Done. Marked ${marked} document${marked === 1 ? "" : "s"} into “${toName}”.`);
      }
      setBusy(false);
      setProgress(null);
      window.dispatchEvent(new Event("allowance-refresh"));
    }
  }

  // "Remove some documents" → cancel the run, back to the start. Nothing was
  // submitted, moved, or marked, so there's nothing to undo.
  function cancelChunk() {
    setChunkCtx(null);
    setChunkInfo(false);
    setError(null);
    setMessage(null);
    setProgress(null);
  }

  // Poll a batch to completion. Returns its results plus whether usage was recorded
  // server-side (C6). Throws after ~20 min so the caller can stop cleanly.
  async function pollBatch(
    batchId: string,
    quality: string,
  ): Promise<{ results: Record<string, MarkResultLike | { error: string }>; recorded: boolean }> {
    for (let attempt = 0; attempt < 240; attempt++) {
      const base = chunkCtx ? "Processing chunk" : "Processing batch";
      setProgress(attempt === 0 ? `${base}…` : `${base}… (${attempt * 5}s)`);
      const res = await fetch(`/api/mark/batch?id=${encodeURIComponent(batchId)}&quality=${quality}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error ?? "Batch retrieval failed";
        throw new Error(body.ref ? `${msg} (ref: ${body.ref})` : msg);
      }
      const data = await res.json();
      if (data.status === "ended") return { results: data.results, recorded: data.recorded !== false };
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error("Batch is taking longer than expected — it may still finish. Try again shortly.");
  }

  async function finish(from: Folder, done: BatchResult[], verb: string) {
    setFiles(await listFiles(from.handle));
    setResults(done);
    persistResults(done);
    const marked  = done.filter((d) => !d.skipped && !d.failed).length;
    const failed  = done.filter((d) => d.failed).length;
    const skipped = done.filter((d) => d.skipped).length;
    let msg = `${verb}. Marked ${marked} paper${marked === 1 ? "" : "s"} into “${toName}”.`;
    if (failed > 0) {
      msg += ` ${failed} paper${failed === 1 ? "" : "s"} couldn’t be marked and ${failed === 1 ? "was" : "were"} left in “${fromName}” to retry.`;
    }
    if (skipped > 0) {
      msg += ` ${skipped} non-PDF file${skipped === 1 ? "" : "s"} ${skipped === 1 ? "was" : "were"} left untouched in “${fromName}”.`;
    }
    setMessage(msg);
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
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <h1 className="text-[18px] font-semibold text-slate-900">Mark New Batch</h1>
          <InstallButton />
        </header>

        {/* Body */}
        <main className="flex-1 overflow-y-auto px-8 py-8 flex flex-col gap-6">

          {/* Plan expired / limit-reached banner (Problem 4) */}
          <PlanNotice />

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
                    disabled={connecting}
                    className="px-4 py-2 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {connecting ? "Connecting…" : "Connect your files"}
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
                      <button
                        type="button"
                        onClick={handleCreateMarkedFolder}
                        className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent-600)] hover:text-[var(--accent-700)] transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Create new folder for marked documents
                      </button>
                    </div>
                  </div>

                  {/* Memo archive */}
                  <div>
                    <label className="block text-[12px] font-medium text-slate-500 mb-1.5">Memo (answer key)</label>
                    {memos.length === 0 ? (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleAddMemo}
                          disabled={addingMemo}
                          className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {addingMemo ? "Adding…" : "+ Add memo"}
                        </button>
                        <span className="text-[13px] text-slate-400">
                          Your memo archive is empty. Add one to reuse it across batches.
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedMemoId ?? ""}
                          onChange={(e) => setSelectedMemoId(e.target.value || null)}
                          className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-[14px] text-slate-800 bg-white outline-none focus:border-[var(--accent-500)]"
                        >
                          <option value="">No memo (mark from general knowledge)</option>
                          {memos.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={handleAddMemo}
                          disabled={addingMemo}
                          className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[13px] font-medium transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                          title="Add a memo to the archive"
                        >
                          {addingMemo ? "Adding…" : "+ Add"}
                        </button>
                        {selectedMemoId && (
                          <button
                            onClick={() => handleDeleteMemo(selectedMemoId)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                            title="Remove this memo from the archive"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-[12px] font-medium text-slate-500 mb-1.5">Subject</label>
                    <SubjectCombobox
                      options={settings.subjects}
                      value={subject}
                      onChange={setSubject}
                      onAddOption={handleAddSubject}
                    />
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

          {/* Error / success banners — dismissible + auto-dismiss (P3-5) */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-[14px] flex items-start gap-3">
              <span className="flex-1">{error}</span>
              <button
                onClick={() => setError(null)}
                aria-label="Dismiss"
                className="shrink-0 -mr-1 -mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          {message && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-5 py-4 text-[14px] flex items-start gap-3">
              <span className="flex-1">{message}</span>
              <button
                onClick={() => setMessage(null)}
                aria-label="Dismiss"
                className="shrink-0 -mr-1 -mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center text-green-500 hover:bg-green-100 hover:text-green-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Marking mode */}
          <div className="bg-white rounded-2xl border border-slate-200 px-7 py-5 flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">Marking mode</h2>
              <p className="text-[13px] text-slate-500 mt-0.5">
                {mode === "instant"
                  ? "Instant — results right away."
                  : "Batch — about half the cost; runs in the background (keep this open)."}
              </p>
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1 shrink-0">
              {(["instant", "batch"] as MarkMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                    mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {m === "instant" ? "Instant" : "Batch"}
                </button>
              ))}
            </div>
          </div>

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
                  {r.skipped ? (
                    <span className="text-[12px] text-slate-400 shrink-0">not a PDF — left in place</span>
                  ) : r.failed ? (
                    <span className="text-[12px] font-semibold text-red-500 shrink-0 bg-red-50 px-3 py-1 rounded-full">not marked</span>
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

      {/* Over-limit dialog (P1-4) — shown when a batch is too big for the allowance.
          Figures are documents only; never Rand (ADR-002). */}
      {chunkCtx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6">
            <h2 className="text-[17px] font-semibold text-slate-900">This batch is over your spending limit</h2>
            <p className="text-[14px] text-slate-600 mt-2">
              We estimate this run of{" "}
              <strong>{chunkCtx.totalDocs} document{chunkCtx.totalDocs === 1 ? "" : "s"}</strong>{" "}
              is more than your plan can mark right now.
            </p>

            <div className="mt-5 flex flex-col gap-2.5">
              <button
                onClick={startChunkLoop}
                className="w-full rounded-xl py-3 bg-[var(--accent-600)] hover:bg-[var(--accent-700)] text-white text-[14px] font-semibold transition-colors"
              >
                Mark in chunks
              </button>
              <button
                onClick={cancelChunk}
                className="w-full rounded-xl py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[14px] font-medium transition-colors"
              >
                Remove some documents
              </button>
            </div>

            <button
              type="button"
              onClick={() => setChunkInfo((v) => !v)}
              className="mt-4 flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-slate-700"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${chunkInfo ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              How does “Mark in chunks” work?
            </button>
            {chunkInfo && (
              <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
                We’ll mark your documents in smaller batches instead of all at once. After
                each batch we check how much of your allowance is left and automatically send
                the next one — getting smaller as you near your limit. Marking stops on its own
                when your allowance runs out, so you only get through the documents your plan
                covers; the rest are left untouched for after you renew. You don’t need to do
                anything while it runs — just keep this tab open.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
