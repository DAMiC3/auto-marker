// ── File System Access API helpers + IndexedDB persistence ──────────────────
// Lets the app read/write a real folder on the user's disk after they grant
// permission. Chromium browsers only (Chrome, Edge). Secure context required.

export interface FileEntry {
  name: string;
  handle: FileSystemFileHandle;
}

export interface Folder {
  name: string;
  handle: FileSystemDirectoryHandle;
}

// ── Loose typings for parts of the spec not in lib.dom ──────────────────────
type PermMode = { mode: "read" | "readwrite" };
type PermHandle = {
  queryPermission?: (d: PermMode) => Promise<PermissionState>;
  requestPermission?: (d: PermMode) => Promise<PermissionState>;
};
type DirIter = {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
};
type WriteData = Uint8Array | ArrayBuffer | Blob | string;
type Writable = {
  write: (data: WriteData) => Promise<void>;
  close: () => Promise<void>;
};
type WritableHandle = { createWritable: () => Promise<Writable> };

// ── IndexedDB (tiny wrapper, no deps) ───────────────────────────────────────
const DB_NAME  = "automark-fs";
const STORE    = "handles";
const ROOT_KEY = "root";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbSet(key: string, val: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r  = tx.objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T);
    r.onerror   = () => reject(r.error);
  });
}

// ── Public API ──────────────────────────────────────────────────────────────
export function isSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function pickRoot(): Promise<FileSystemDirectoryHandle> {
  const w = window as unknown as {
    showDirectoryPicker: (o?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
  };
  const handle = await w.showDirectoryPicker({ mode: "readwrite" });
  await idbSet(ROOT_KEY, handle);
  return handle;
}

export async function loadSavedRoot(): Promise<FileSystemDirectoryHandle | null> {
  const handle = await idbGet<FileSystemDirectoryHandle>(ROOT_KEY);
  return handle ?? null;
}

/** Check permission without prompting (safe on mount, no user gesture). */
export async function hasPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as unknown as PermHandle;
  if (!h.queryPermission) return true;
  return (await h.queryPermission({ mode: "readwrite" })) === "granted";
}

/** Prompt for permission — must be called from a user gesture. */
export async function ensurePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as unknown as PermHandle;
  if (!h.queryPermission || !h.requestPermission) return true;
  if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await h.requestPermission({ mode: "readwrite" })) === "granted";
}

export async function listFolders(root: FileSystemDirectoryHandle): Promise<Folder[]> {
  const out: Folder[] = [];
  for await (const [name, handle] of (root as unknown as DirIter).entries()) {
    if (handle.kind === "directory") out.push({ name, handle: handle as FileSystemDirectoryHandle });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listFiles(dir: FileSystemDirectoryHandle): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  for await (const [name, handle] of (dir as unknown as DirIter).entries()) {
    if (handle.kind === "file") out.push({ name, handle: handle as FileSystemFileHandle });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Copy a file into `to`, then remove it from `from` (a move). */
export async function moveFile(
  name: string,
  from: FileSystemDirectoryHandle,
  to: FileSystemDirectoryHandle
): Promise<void> {
  const srcHandle  = await from.getFileHandle(name);
  const file       = await srcHandle.getFile();
  const destHandle = await to.getFileHandle(name, { create: true });
  const writable   = await (destHandle as unknown as WritableHandle).createWritable();
  await writable.write(await file.arrayBuffer());
  await writable.close();
  await from.removeEntry(name);
}

/** Write raw bytes to a new file inside `dir`. */
export async function writeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: WriteData
): Promise<void> {
  const handle   = await dir.getFileHandle(name, { create: true });
  const writable = await (handle as unknown as WritableHandle).createWritable();
  await writable.write(data);
  await writable.close();
}

/** Read a single file from the From folder as a File object. */
export async function readFile(
  dir: FileSystemDirectoryHandle,
  name: string
): Promise<File> {
  const handle = await dir.getFileHandle(name);
  return handle.getFile();
}

/** Open a single-file picker (used for choosing the memo / answer key). */
export async function pickFile(): Promise<File | null> {
  const w = window as unknown as {
    showOpenFilePicker?: (o?: unknown) => Promise<FileSystemFileHandle[]>;
  };
  if (!w.showOpenFilePicker) return null;
  try {
    const [handle] = await w.showOpenFilePicker({
      types: [{ description: "Documents", accept: { "application/pdf": [".pdf"], "text/plain": [".txt"] } }],
    });
    return handle.getFile();
  } catch {
    return null; // user cancelled
  }
}
