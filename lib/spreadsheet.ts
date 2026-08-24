// Spreadsheet (.xlsx / .xlsm / .csv) → plain text, for memos written as a marks grid.
//
// An .xlsx is just a zip of XML parts, and we already ship JSZip for zipped paper
// batches — so reading one needs no new dependency and no extra bundle weight. Only
// cell VALUES matter here: a memo is used purely as text in the marking prompt
// (lib/markingPrompt), never rendered, so styling is irrelevant and the cached
// results of formulas are exactly what we want.
import JSZip from "jszip";

const XLSX_EXT = /\.(xlsx|xlsm)$/i;
const CSV_EXT  = /\.csv$/i;
const XLS_EXT  = /\.xls$/i;

/** True for anything we route to this module — including legacy .xls, which we
 *  can't read but want to reject with a useful message rather than a blank memo. */
export function isSpreadsheet(name: string): boolean {
  return XLSX_EXT.test(name) || CSV_EXT.test(name) || XLS_EXT.test(name);
}

// ── XML helpers ──────────────────────────────────────────────────────────────
// Every lookup is namespace-agnostic (getElementsByTagNameNS("*", …)): most writers
// emit unprefixed tags under a default namespace, but some use a prefix (`x:row`),
// and a plain getElementsByTagName would silently miss those and yield an empty memo.
function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) throw new Error("malformed XML");
  return doc;
}

function tags(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", name));
}

/** Concatenated text of every <t> under a node. A shared string is split across
 *  several <r> runs whenever part of the cell is styled differently, so taking only
 *  the first <t> would truncate answers mid-sentence. */
function textOf(node: Element): string {
  return tags(node, "t").map((t) => t.textContent ?? "").join("");
}

/** Column letters of a cell ref → zero-based index ("A1"→0, "AA7"→26). */
function colIndex(ref: string): number {
  const letters = ref.match(/^[A-Za-z]+/)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// ── Workbook structure ───────────────────────────────────────────────────────
/** Worksheet parts in workbook (tab) order, with their names. Hidden sheets are
 *  skipped — they hold lookup tables and scratch working the lecturer never sees,
 *  and folding them into the answer key would only confuse the marker. */
async function sheetTargets(zip: JSZip): Promise<{ name: string; path: string }[]> {
  const bookXml = await zip.file("xl/workbook.xml")?.async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string");

  if (bookXml && relsXml) {
    const rels = new Map<string, string>();
    for (const rel of tags(parseXml(relsXml), "Relationship")) {
      const id = rel.getAttribute("Id");
      const target = rel.getAttribute("Target");
      // Targets come either relative to xl/ ("worksheets/sheet1.xml") or absolute
      // ("/xl/worksheets/sheet1.xml") depending on the writer; normalise both.
      if (id && target) rels.set(id, target.replace(/^\/?(xl\/)?/, ""));
    }

    const out: { name: string; path: string }[] = [];
    tags(parseXml(bookXml), "sheet").forEach((el, i) => {
      if ((el.getAttribute("state") ?? "visible") !== "visible") return;
      const rid =
        el.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ??
        el.getAttribute("r:id");
      const target = rid ? rels.get(rid) : undefined;
      if (target) out.push({ name: el.getAttribute("name") ?? `Sheet ${i + 1}`, path: `xl/${target}` });
    });
    if (out.length > 0) return out;
  }

  // Fallback for unusual layouts: take the worksheet parts in filename order so an
  // odd workbook still yields its answers instead of an empty memo.
  return Object.keys(zip.files)
    .filter((p) => /^xl\/worksheets\/[^/]+\.xml$/i.test(p))
    .sort()
    .map((path, i) => ({ name: `Sheet ${i + 1}`, path }));
}

// ── Cells → lines ────────────────────────────────────────────────────────────
function cellValue(cell: Element, shared: string[]): string {
  const type = cell.getAttribute("t") ?? "n";
  if (type === "inlineStr") {
    const is = tags(cell, "is")[0];
    return is ? textOf(is).trim() : "";
  }
  const v = tags(cell, "v")[0]?.textContent ?? "";
  if (!v) return "";
  if (type === "s") return (shared[Number(v)] ?? "").trim(); // <v> holds an index into the shared table
  if (type === "b") return v === "1" ? "TRUE" : "FALSE";
  return v.trim(); // number, formula string result (t="str"), or error text
}

/** One line per non-empty row, cells separated by " | " so the column structure of a
 *  marks grid (question · answer · marks) survives into the prompt. */
function sheetLines(doc: Document, shared: string[]): string[] {
  const rows: string[][] = [];
  for (const row of tags(doc, "row")) {
    const values: string[] = [];
    for (const cell of tags(row, "c")) {
      const ref = cell.getAttribute("r");
      values[ref ? colIndex(ref) : values.length] = cellValue(cell, shared);
    }
    rows.push(Array.from(values, (v) => v ?? ""));
  }

  // Drop leading columns that are empty in EVERY row — a grid starting at column C
  // would otherwise carry a " |  | " indent on every line. Done across the whole
  // sheet, never per row, so columns stay aligned with each other.
  const firstUsed = rows.reduce((min, r) => {
    const i = r.findIndex((v) => v !== "");
    return i === -1 ? min : Math.min(min, i);
  }, Infinity);
  if (!Number.isFinite(firstUsed)) return [];

  return rows
    .map((r) => r.slice(firstUsed).join(" | ").replace(/(\s*\|)+\s*$/, "").trim())
    .filter(Boolean);
}

// ── Entry point ──────────────────────────────────────────────────────────────
/** Extract an .xlsx/.xlsm/.csv memo as text. Throws a message written for the
 *  lecturer when the file can't be read at all (legacy .xls, corrupt, protected). */
export async function extractSpreadsheetText(file: File): Promise<string> {
  if (CSV_EXT.test(file.name)) return file.text();
  if (XLS_EXT.test(file.name)) {
    throw new Error(
      `“${file.name}” is in the old Excel format (.xls), which AutoMark can’t read. ` +
        `Open it in Excel and use File → Save As → Excel Workbook (.xlsx), then add it again.`
    );
  }

  let zip: JSZip;
  try {
    // A password-protected workbook isn't a zip at all, so it fails here too.
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error(
      `“${file.name}” couldn’t be opened — the file may be corrupt or password-protected. ` +
        `Open it in Excel, remove any password, save it again and re-add it.`
    );
  }

  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const shared = sharedXml ? tags(parseXml(sharedXml), "si").map(textOf) : [];

  const sheets = await sheetTargets(zip);
  const parts: string[] = [];
  for (const sheet of sheets) {
    const xml = await zip.file(sheet.path)?.async("string");
    if (!xml) continue;
    const lines = sheetLines(parseXml(xml), shared);
    if (lines.length === 0) continue;
    // Name each sheet only in a multi-sheet workbook — a one-sheet memo reads
    // cleaner without a stray "## Sheet1" heading sitting on top of it.
    parts.push(sheets.length > 1 ? `## ${sheet.name}\n${lines.join("\n")}` : lines.join("\n"));
  }
  return parts.join("\n\n");
}
