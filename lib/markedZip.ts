// ── Marked-zip sink: re-zip marked papers back into a zip ───────────────────
// When papers came from inside a zip (e.g. a Moodle "Download all submissions"
// archive), their marked versions are collected here — one JSZip per source zip
// — and written back out as "<zip> (marked).zip" with the SAME internal folder
// structure. That way the output is a drop-in replacement the user can upload
// straight back to Moodle ("Upload multiple feedback files in a zip"), rather
// than a loose folder tree they'd have to re-zip by hand.
//
// Loose (non-zip) papers do NOT go through here — they keep mirroring into the
// To folder as individual files. Only successfully-marked papers are added, so a
// zip whose papers all failed is never created.

import JSZip from "jszip";
import { writeFileNested } from "@/lib/fileSystem";

export interface ZipSink {
  /** Add one marked paper to the zip identified by `zipName`, at `entryPath`. */
  add: (zipName: string, entryPath: string, bytes: Uint8Array) => void;
  /** Write every accumulated zip into `to` as "<zipName> (marked).zip".
   *  Returns the relative paths actually written (for reporting). */
  flush: (to: FileSystemDirectoryHandle) => Promise<string[]>;
  /** How many distinct source zips have received at least one marked paper. */
  size: () => number;
}

export function createZipSink(): ZipSink {
  const zips = new Map<string, JSZip>();
  return {
    add(zipName, entryPath, bytes) {
      let zip = zips.get(zipName);
      if (!zip) { zip = new JSZip(); zips.set(zipName, zip); }
      zip.file(entryPath, bytes);
    },
    async flush(to) {
      const written: string[] = [];
      for (const [zipName, zip] of zips) {
        const bytes = await zip.generateAsync({ type: "uint8array" });
        const path  = await writeFileNested(to, `${zipName} (marked).zip`, bytes);
        written.push(path);
      }
      return written;
    },
    size: () => zips.size,
  };
}

/** "essay.pdf" → "essay (marked).pdf" (suffix inserted before the extension),
 *  preserving any folder part of the path. */
export function markedLeaf(path: string): string {
  return path.replace(/\.pdf$/i, "") + " (marked).pdf";
}
