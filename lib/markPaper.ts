// Client-side marking pipeline (text-first):
//   PDF → per-page text + y-hints (image fallback) → AI marks → stamp the PDF.
import { PDFDocument, rgb, StandardFonts, type PDFPage, type RGB } from "pdf-lib";
import type { MarkType } from "@/components/SettingsPanel";
import type { PageContent, Annotation } from "@/lib/markingPrompt";

export type { PageContent } from "@/lib/markingPrompt";

export interface PreparedPaper {
  original: Uint8Array;
  pages: PageContent[];
}

export interface MarkOutcome {
  bytes: Uint8Array;
  total: number;
  available: number;
  percentage: number;
  summary: string;
}

// ── pdf.js (browser) ─────────────────────────────────────────────────────────
async function getPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  return pdfjs;
}

interface TextItemish { str?: string; transform?: number[] }

// Cap the rendered fallback image so a large-format page (A3, posters, oversized
// scans) can't balloon the request body and vision-token cost. The longest side is
// clamped to this many pixels; the 1.6 render scale is only used when it stays under
// the cap (P2-6).
const MAX_IMAGE_DIM = 2000;

/** True if a rendered page is essentially empty (almost all white pixels). */
function isCanvasBlank(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  const total = w * h;
  let nonWhite = 0;
  let sampled = 0;
  // Sample ~1 in every 16 pixels for speed
  for (let p = 0; p < total; p += 16) {
    const i = p * 4;
    if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) nonWhite++;
    sampled++;
  }
  // Blank if under 0.2% of sampled pixels carry any ink
  return sampled > 0 && nonWhite / sampled < 0.002;
}

/**
 * Prepare a paper for marking: extract each page's text (with vertical y-hints)
 * for typed PDFs; fall back to a rendered image only for pages with no text
 * layer (scans / diagrams). Text is ~10× cheaper than images.
 */
export async function preparePaper(file: File): Promise<PreparedPaper> {
  const original = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await getPdfjs();
  const pdf   = await pdfjs.getDocument({ data: original.slice(0) }).promise;
  const pages: PageContent[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page     = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content  = await page.getTextContent();
    const items = (content.items as TextItemish[]).filter(
      (it) => typeof it.str === "string" && it.str.trim().length > 0 && it.transform
    );

    if (items.length > 0) {
      // Group items into lines by their vertical position, then order top→bottom.
      const H = viewport.height;
      const lines: { y: number; parts: { x: number; s: string }[] }[] = [];
      for (const it of items) {
        const x = it.transform![4];
        const y = 1 - it.transform![5] / H; // normalized, 0 = top
        let ln = lines.find((l) => Math.abs(l.y - y) < 0.012);
        if (!ln) { ln = { y, parts: [] }; lines.push(ln); }
        ln.parts.push({ x, s: it.str! });
      }
      lines.sort((a, b) => a.y - b.y);
      const text = lines
        .map((l) => {
          const s = l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ").replace(/\s+/g, " ").trim();
          return `[y=${l.y.toFixed(2)}] ${s}`;
        })
        .join("\n");
      pages.push({ kind: "text", text });
    } else {
      // No text layer → render to check it, then either skip (blank) or send as image.
      // Clamp the render scale so the longest side never exceeds MAX_IMAGE_DIM (P2-6).
      const scale  = Math.min(1.6, MAX_IMAGE_DIM / Math.max(viewport.width, viewport.height));
      const vp     = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width  = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;

      // Skip truly blank pages entirely — don't waste tokens sending them
      if (isCanvasBlank(ctx, canvas.width, canvas.height)) continue;

      pages.push({ kind: "image", data: canvas.toDataURL("image/png").split(",")[1] });
    }
  }

  return { original, pages };
}

/** Best-effort memo text extraction (digital PDF text layer / .txt). */
export async function extractMemoText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) return file.text();
  if (name.endsWith(".pdf")) {
    const pdfjs = await getPdfjs();
    const buf = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    let out = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      out += (content.items as TextItemish[]).map((it) => it.str ?? "").join(" ") + "\n";
    }
    return out;
  }
  return "";
}

// ── PDF stamping ─────────────────────────────────────────────────────────────
function wrapText(text: string, font: import("pdf-lib").PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (cur && font.widthOfTextAtSize(test, size) > maxWidth) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function drawShape(page: PDFPage, shape: string, x: number, y: number, s: number, color: RGB) {
  const t = 2;
  switch (shape) {
    case "tick":
      page.drawLine({ start: { x: x - s * 0.5, y }, end: { x: x - s * 0.1, y: y - s * 0.5 }, thickness: t, color });
      page.drawLine({ start: { x: x - s * 0.1, y: y - s * 0.5 }, end: { x: x + s * 0.6, y: y + s * 0.6 }, thickness: t, color });
      break;
    case "half":
      page.drawLine({ start: { x: x - s * 0.5, y }, end: { x: x - s * 0.1, y: y - s * 0.5 }, thickness: t, color });
      page.drawLine({ start: { x: x - s * 0.1, y: y - s * 0.5 }, end: { x: x + s * 0.6, y: y + s * 0.6 }, thickness: t, color });
      page.drawLine({ start: { x: x + s * 0.55, y: y + s * 0.7 }, end: { x: x - s * 0.2, y: y - s * 0.7 }, thickness: 1.5, color });
      break;
    case "cross":
      page.drawLine({ start: { x: x - s * 0.5, y: y + s * 0.5 }, end: { x: x + s * 0.5, y: y - s * 0.5 }, thickness: t, color });
      page.drawLine({ start: { x: x - s * 0.5, y: y - s * 0.5 }, end: { x: x + s * 0.5, y: y + s * 0.5 }, thickness: t, color });
      break;
    case "circle":
      page.drawEllipse({ x, y, xScale: s * 0.7, yScale: s * 0.7, borderColor: color, borderWidth: t });
      break;
    case "underline":
      page.drawLine({ start: { x: x - s, y: y - s * 0.6 }, end: { x: x + s, y: y - s * 0.6 }, thickness: t, color });
      break;
    case "dot":
      page.drawCircle({ x, y, size: s * 0.35, color });
      break;
  }
}

/** Stamp annotations (1-based page index) onto the original PDF bytes. */
export async function stampPaper(
  original: Uint8Array,
  annotations: Annotation[],
  markTypes: MarkType[],
  total: number,
  available: number,
  summary = ""
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(original);
  const font   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages  = pdfDoc.getPages();

  const colorForShape = (shape: string): RGB => {
    const mt = markTypes.find((m) => m.shape === shape);
    return mt ? hexToRgb(mt.color) : rgb(0.86, 0.15, 0.15);
  };

  // Comments are collected and printed at the bottom — the margins are too
  // narrow to write them beside the answers without overlapping/clipping.
  const notes: { marks: string; comment: string; color: RGB }[] = [];

  for (const ann of annotations) {
    const page = pages[ann.page - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const color = colorForShape(ann.shape);
    const y = height * (1 - Math.min(Math.max(ann.y, 0), 1));
    // Shape + score sit in the far-right margin, clear of the answer text.
    const x = width - 42;

    drawShape(page, ann.shape, x, y, 12, color);
    if (ann.marks) page.drawText(ann.marks, { x: width - 32, y: y - 15, size: 9, font, color });
    if (ann.comment) notes.push({ marks: ann.marks, comment: ann.comment, color });
  }

  const p0 = pages[0];
  if (p0) {
    const { width, height } = p0.getSize();
    const label = `Total: ${total} / ${available}`;
    const w = font.widthOfTextAtSize(label, 16);
    p0.drawRectangle({ x: width - w - 28, y: height - 40, width: w + 16, height: 26, borderColor: rgb(0.86, 0.15, 0.15), borderWidth: 1.5, color: rgb(1, 0.95, 0.95) });
    p0.drawText(label, { x: width - w - 20, y: height - 34, size: 16, font, color: rgb(0.86, 0.15, 0.15) });
  }

  // Marker's notes + overall comment at the bottom of the last page
  if (pages.length > 0 && (notes.length > 0 || summary.trim())) {
    const last = pages[pages.length - 1];
    const { width } = last.getSize();
    const maxW = width - 100;
    const lh = 12;

    const block: { text: string; size: number; color: RGB }[] = [];
    if (notes.length > 0) {
      block.push({ text: "Marker's notes:", size: 10, color: rgb(0.2, 0.2, 0.2) });
      for (const n of notes) {
        wrapText(`• ${n.marks}  ${n.comment}`, font, 9, maxW).forEach((ln, i) =>
          block.push({ text: ln, size: 9, color: i === 0 ? n.color : rgb(0.35, 0.35, 0.35) })
        );
      }
    }
    if (summary.trim()) {
      wrapText(`Overall: ${summary.trim()}`, font, 9, maxW).forEach((ln) =>
        block.push({ text: ln, size: 9, color: rgb(0.2, 0.2, 0.2) })
      );
    }

    let y = 28 + (block.length - 1) * lh;
    for (const b of block) {
      last.drawText(b.text, { x: 50, y, size: b.size, font, color: b.color });
      y -= lh;
    }
  }

  return new Uint8Array(await pdfDoc.save());
}

// ── Instant single-paper marking ─────────────────────────────────────────────
export async function markInstant(
  file: File,
  memoText: string,
  subject: string,
  strictness: number,
  markTypes: MarkType[],
  quality: "standard" | "high" = "standard"
): Promise<MarkOutcome> {
  const { original, pages } = await preparePaper(file);

  const res = await fetch("/api/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memoText,
      subject,
      strictness,
      quality,
      pages,
      markTypes: markTypes.map((m) => ({ abbrev: m.abbrev, label: m.label, shape: m.shape })),
    }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Marking failed");

  const data  = await res.json();
  const bytes = await stampPaper(original, data.annotations ?? [], markTypes, data.total ?? 0, data.available ?? 0, data.summary ?? "");
  return {
    bytes,
    total: data.total ?? 0,
    available: data.available ?? 0,
    percentage: data.percentage ?? 0,
    summary: data.summary ?? "",
  };
}
