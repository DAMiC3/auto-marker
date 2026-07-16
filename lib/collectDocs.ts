// ── Document collection: recurse subfolders + expand zips ───────────────────
// Turns a "From" folder into a flat list of PDFs to mark, no matter how deep
// they sit. It walks every subfolder to any depth AND expands any `.zip` it
// finds (e.g. a Moodle "Download all submissions" archive), so the user can just
// drop a zip into the From folder — or nest papers in per-class/per-student
// folders — and everything gets marked.
//
// Each PDF becomes a `Doc` with:
//   • `path`   — its location relative to the From folder ("classA/essay.pdf",
//                or "<zipname>/studentA_123_.../essay.pdf" for zip contents).
//                Marked output mirrors this path into the To folder, which keeps
//                a Moodle student-identifier structure intact for re-upload.
//   • getFile  — lazy read of the bytes (disk handle or zip entry), so we don't
//                hold every file in memory at once during instant marking.
//   • remove   — delete the original after a successful mark. Undefined for zip
//                entries: we never mutate the user's downloaded zip.

import JSZip from "jszip";

export interface Doc {
  path: string;
  getFile: () => Promise<File>;
  remove?: () => Promise<void>;
  fromZip: boolean;
}

export interface Collected {
  docs: Doc[];      // PDFs to mark (recursive + expanded from zips), sorted by path
  others: Doc[];    // non-PDF disk files, left untouched and reported as skipped
  zipCount: number; // how many zips were expanded (for messaging)
}

const isPdf = (name: string) => name.toLowerCase().endsWith(".pdf");
const isZip = (name: string) => name.toLowerCase().endsWith(".zip");

// AutoMark's own output folders — skipped when walking so that pointing "From"
// at the workspace root can't re-mark previously marked papers or quarantined ones.
const isOutputFolder = (name: string) =>
  name === "Problematic papers" || name.startsWith("Marked ");

type DirIter = { entries(): AsyncIterableIterator<[string, FileSystemHandle]> };

export async function collectDocs(from: FileSystemDirectoryHandle): Promise<Collected> {
  const docs: Doc[] = [];
  const others: Doc[] = [];
  let zipCount = 0;

  async function expandZip(zipFile: File, prefix: string): Promise<void> {
    // loadAsync reads the archive into memory and parses its directory, but does
    // NOT decompress entries — that happens lazily in each Doc's getFile().
    const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
    const entries = Object.values(zip.files)
      .filter((e) => !e.dir && isPdf(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      docs.push({
        path: `${prefix}/${entry.name}`,
        fromZip: true,
        getFile: async () => {
          const blob = await entry.async("blob");
          const base = entry.name.split("/").pop() || entry.name;
          return new File([blob], base, { type: "application/pdf" });
        },
      });
    }
  }

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, handle] of (dir as unknown as DirIter).entries()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "directory") {
        if (isOutputFolder(name)) continue;
        await walk(handle as FileSystemDirectoryHandle, rel);
      } else if (isPdf(name)) {
        const fh = handle as FileSystemFileHandle;
        docs.push({
          path: rel,
          fromZip: false,
          getFile: () => fh.getFile(),
          remove: () => dir.removeEntry(name),
        });
      } else if (isZip(name)) {
        zipCount++;
        const fh = handle as FileSystemFileHandle;
        const base = name.replace(/\.zip$/i, "");
        await expandZip(await fh.getFile(), prefix ? `${prefix}/${base}` : base);
      } else {
        const fh = handle as FileSystemFileHandle;
        others.push({ path: rel, fromZip: false, getFile: () => fh.getFile() });
      }
    }
  }

  await walk(from, "");
  docs.sort((a, b) => a.path.localeCompare(b.path));
  others.sort((a, b) => a.path.localeCompare(b.path));
  return { docs, others, zipCount };
}
