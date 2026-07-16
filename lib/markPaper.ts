// Client-side marking pipeline (text-first):
//   PDF → per-page text + y-hints (image fallback) → AI marks → stamp the PDF.
import { PDFDocument, rgb, StandardFonts, type PDFPage, type RGB } from "pdf-lib";
import type { MarkType } from "@/components/SettingsPanel";
import type { PageContent, Annotation } from "@/lib/markingPrompt";
import { SHAPE_GEOMETRY, shapeWeight, type MarkShape } from "@/lib/markShapes";

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
  // Blank only if under 0.05% of sampled pixels carry any ink. Kept deliberately
  // low so a faint or low-contrast real answer page isn't mistaken for blank and
  // silently dropped (P2-2) — a truly empty page still sits at ~0% ink.
  return sampled > 0 && nonWhite / sampled < 0.0005;
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

      // Skip truly blank pages entirely — don't waste tokens sending them. The
      // threshold is kept low (see isCanvasBlank) so a faint real page isn't dropped.
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

// Stamp a mark shape onto the PDF by walking the shared geometry (lib/markShapes).
// The on-screen legend icon (components/MarkShapeIcon) renders the SAME geometry,
// so the two can't drift (P3-4). Unit coords are scaled by `s` and offset to (x,y);
// the geometry is y-up, matching pdf-lib, so no flip is needed here.
function drawShape(page: PDFPage, shape: string, x: number, y: number, s: number, color: RGB) {
  const BASE = 2; // base stroke thickness in PDF points
  const prims = SHAPE_GEOMETRY[shape as MarkShape];
  if (!prims) return;
  for (const p of prims) {
    if (p.kind === "line") {
      page.drawLine({
        start: { x: x + p.from[0] * s, y: y + p.from[1] * s },
        end:   { x: x + p.to[0] * s,   y: y + p.to[1] * s },
        thickness: BASE * shapeWeight(p),
        color,
      });
    } else if (p.kind === "ellipse") {
      page.drawEllipse({
        x: x + p.cx * s, y: y + p.cy * s,
        xScale: p.rx * s, yScale: p.ry * s,
        borderColor: color, borderWidth: BASE * shapeWeight(p),
      });
    } else if (p.kind === "disc") {
      page.drawCircle({ x: x + p.cx * s, y: y + p.cy * s, size: p.r * s, color });
    }
  }
}

/** Stamp annotations (1-based page index) onto the original PDF bytes.
 *  `includeFeedback` off ⇒ stamp only shapes + scores + total, and append no
 *  feedback pages — honouring the user's "No feedback" setting even if the model
 *  returned stray notes/summary. */
export async function stampPaper(
  original: Uint8Array,
  annotations: Annotation[],
  markTypes: MarkType[],
  total: number,
  available: number,
  summary = "",
  includeFeedback = true
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
    if (includeFeedback && ann.comment) notes.push({ marks: ann.marks, comment: ann.comment, color });
  }

  const p0 = pages[0];
  if (p0) {
    const { width, height } = p0.getSize();
    const label = `Total: ${total} / ${available}`;
    const w = font.widthOfTextAtSize(label, 16);
    p0.drawRectangle({ x: width - w - 28, y: height - 40, width: w + 16, height: 26, borderColor: rgb(0.86, 0.15, 0.15), borderWidth: 1.5, color: rgb(1, 0.95, 0.95) });
    p0.drawText(label, { x: width - w - 20, y: height - 34, size: 16, font, color: rgb(0.86, 0.15, 0.15) });
  }

  // ── Marker's feedback on dedicated appended page(s) ──────────────────────────
  // The notes + overall summary are often long and used to be drawn at the bottom
  // of the last exam page, where they overprinted the student's answers. Instead we
  // lay them out on fresh page(s) appended AFTER the paper, adding exactly as many
  // pages as the wrapped text needs so nothing is ever written over the exam.
  //
  // (Appending happens after the annotation loop, so it never shifts the page
  //  indices the annotations were placed on.)
  const effectiveSummary = includeFeedback ? summary : "";
  if (notes.length > 0 || effectiveSummary.trim()) {
    // Match the paper's own page size so the feedback pages look part of the doc;
    // fall back to A4 if the source somehow had no pages.
    const ref = pages[pages.length - 1];
    const { width: PW, height: PH } = ref ? ref.getSize() : { width: 595.28, height: 841.89 };

    const LEFT = 50, RIGHT = 50, TOP = 58, BOTTOM = 50;
    const maxW = PW - LEFT - RIGHT;
    const lh = 14;              // body line height on a feedback page
    const titleSize = 14;
    const bodySize = 10;
    const afterTitleGap = 12;   // space below the page title before the first line

    // Flatten the feedback into a list of already-wrapped lines, each with an
    // optional gap above it (to separate the heading / notes / overall blocks).
    interface FbLine { text: string; size: number; color: RGB; gapBefore: number }
    const lines: FbLine[] = [];

    if (notes.length > 0) {
      lines.push({ text: "Marker's notes", size: 11, color: rgb(0.15, 0.15, 0.15), gapBefore: 0 });
      for (const n of notes) {
        const label = n.marks ? `• ${n.marks}  ${n.comment}` : `• ${n.comment}`;
        wrapText(label, font, bodySize, maxW).forEach((ln, i) =>
          lines.push({ text: ln, size: bodySize, color: i === 0 ? n.color : rgb(0.35, 0.35, 0.35), gapBefore: i === 0 ? 5 : 0 })
        );
      }
    }
    if (effectiveSummary.trim()) {
      wrapText(`Overall: ${effectiveSummary.trim()}`, font, bodySize, maxW).forEach((ln, i) =>
        lines.push({ text: ln, size: bodySize, color: rgb(0.15, 0.15, 0.15), gapBefore: i === 0 ? (notes.length > 0 ? 12 : 0) : 0 })
      );
    }

    // Work out how many pages are needed by laying the lines out and starting a new
    // page whenever the next line (plus its gap) would cross the bottom margin.
    const startPage = (continued: boolean): { page: PDFPage; y: number } => {
      const page = pdfDoc.addPage([PW, PH]);
      let y = PH - TOP;
      page.drawText(continued ? "Marker's feedback (continued)" : "Marker's feedback", {
        x: LEFT, y, size: titleSize, font, color: rgb(0.1, 0.1, 0.1),
      });
      y -= titleSize + afterTitleGap;
      return { page, y };
    };

    let { page, y } = startPage(false);
    for (const ln of lines) {
      if (y - (ln.gapBefore + lh) < BOTTOM) ({ page, y } = startPage(true));
      y -= ln.gapBefore;
      page.drawText(ln.text, { x: LEFT, y, size: ln.size, font, color: ln.color });
      y -= lh;
    }
  }

  return new Uint8Array(await pdfDoc.save());
}

// ── Instant single-paper marking ─────────────────────────────────────────────
export async function markInstant(
  prepared: PreparedPaper,
  memoText: string,
  subject: string,
  strictness: number,
  markTypes: MarkType[],
  quality: "standard" | "high" = "standard",
  feedback = true
): Promise<MarkOutcome> {
  // P5-1: the caller prepares the paper first so it can run the injection check
  // (hasFenceCollision) and quarantine before any text is sent to the model.
  const { original, pages } = prepared;

  const res = await fetch("/api/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memoText,
      subject,
      strictness,
      quality,
      feedback,
      pages,
      markTypes: markTypes.map((m) => ({ abbrev: m.abbrev, label: m.label, shape: m.shape })),
    }),
  });
  if (!res.ok) {
    // P4-6: surface the server's correlation id so the user can quote it in a report.
    const body = await res.json().catch(() => ({}));
    const msg = body.error ?? "Marking failed";
    throw new Error(body.ref ? `${msg} (ref: ${body.ref})` : msg);
  }

  const data  = await res.json();
  const bytes = await stampPaper(original, data.annotations ?? [], markTypes, data.total ?? 0, data.available ?? 0, data.summary ?? "", feedback);
  return {
    bytes,
    total: data.total ?? 0,
    available: data.available ?? 0,
    percentage: data.percentage ?? 0,
    summary: data.summary ?? "",
  };
}
