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
      // No text layer → render an image fallback
      const vp     = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width  = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
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
  available: number
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(original);
  const font   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages  = pdfDoc.getPages();

  const colorForShape = (shape: string): RGB => {
    const mt = markTypes.find((m) => m.shape === shape);
    return mt ? hexToRgb(mt.color) : rgb(0.86, 0.15, 0.15);
  };

  for (const ann of annotations) {
    const page = pages[ann.page - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const color = colorForShape(ann.shape);
    const y = height * (1 - Math.min(Math.max(ann.y, 0), 1));
    const x = width * 0.84;

    drawShape(page, ann.shape, x, y, 14, color);
    if (ann.marks)   page.drawText(ann.marks,   { x: x + 16, y: y - 4, size: 11, font, color });
    if (ann.comment) page.drawText(ann.comment, { x: width * 0.62, y: y - 18, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
  }

  const p0 = pages[0];
  if (p0) {
    const { width, height } = p0.getSize();
    const label = `Total: ${total} / ${available}`;
    const w = font.widthOfTextAtSize(label, 16);
    p0.drawRectangle({ x: width - w - 28, y: height - 40, width: w + 16, height: 26, borderColor: rgb(0.86, 0.15, 0.15), borderWidth: 1.5, color: rgb(1, 0.95, 0.95) });
    p0.drawText(label, { x: width - w - 20, y: height - 34, size: 16, font, color: rgb(0.86, 0.15, 0.15) });
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
  const bytes = await stampPaper(original, data.annotations ?? [], markTypes, data.total ?? 0, data.available ?? 0);
  return {
    bytes,
    total: data.total ?? 0,
    available: data.available ?? 0,
    percentage: data.percentage ?? 0,
    summary: data.summary ?? "",
  };
}
