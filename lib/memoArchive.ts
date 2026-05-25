// Persistent memo (answer-key) archive, stored in IndexedDB so memos survive
// reloads and don't need re-uploading. Pure storage — no PDF/AI deps.

export interface Memo {
  id: string;
  name: string;
  addedAt: number;
  text: string;   // extracted answer-key text used for marking
  blob?: Blob;    // original file, kept for re-viewing / future use
}

const DB_NAME = "automark-memos";
const STORE   = "memos";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function saveMemo(memo: Memo): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(memo);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

export async function listMemos(): Promise<Memo[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const r  = tx.objectStore(STORE).getAll();
    r.onsuccess = () => resolve((r.result as Memo[]).sort((a, b) => b.addedAt - a.addedAt));
    r.onerror   = () => reject(r.error);
  });
}

export async function deleteMemo(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
