// Client-side marking pipeline:
//   PDF → page images → AI marks → stamp shapes onto the PDF → marked bytes.
import { PDFDocument, rgb, StandardFonts, type PDFPage, type RGB } from "pdf-lib";
import type { MarkType } from "@/components/SettingsPanel";

interface Annotation {
  page: number;
  y: number;
  shape: string;
  marks: string;
  comment: string;
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

/** Render every page of a PDF to a base64 PNG. */
async function renderToImages(bytes: Uint8Array): Promise<string[]> {
  const pdfjs = await getPdfjs();
  const pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const images: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page     = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas   = document.createElement("canvas");
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    const ctx      = canvas.getContext("2d")!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    images.push(canvas.toDataURL("image/png").split(",")[1]);
  }
  return images;
}

/** Best-effort text extraction (digital PDFs / txt). Returns "" for scans. */
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
      out += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
    }
    return out;
  }
  return "";
}

// ── Drawing helpers ──────────────────────────────────────────────────────────
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

/** Stamp annotations onto the original PDF bytes. */
async function stampPdf(
  original: Uint8Array,
  annotations: Annotation[],
  markTypes: MarkType[],
  total: number,
  available: number
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(original);
  const font   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages  = pdfDoc.getPages();

  // shape → colour (first mark type using that shape)
  const colorForShape = (shape: string): RGB => {
    const mt = markTypes.find((m) => m.shape === shape);
    return mt ? hexToRgb(mt.color) : rgb(0.86, 0.15, 0.15);
  };

  for (const ann of annotations) {
    const page = pages[ann.page];
    if (!page) continue;
    const { width, height } = page.getSize();
    const color = colorForShape(ann.shape);
    const y = height * (1 - Math.min(Math.max(ann.y, 0), 1));
    const x = width * 0.84;

    drawShape(page, ann.shape, x, y, 14, color);
    if (ann.marks)   page.drawText(ann.marks,   { x: x + 16, y: y - 4, size: 11, font, color });
    if (ann.comment) page.drawText(ann.comment, { x: width * 0.62, y: y - 18, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
  }

  // Total box on the first page
  const p0 = pages[0];
  if (p0) {
    const { width, height } = p0.getSize();
    const label = `Total: ${total} / ${available}`;
    const w = font.widthOfTextAtSize(label, 16);
    p0.drawRectangle({ x: width - w - 28, y: height - 40, width: w + 16, height: 26, borderColor: rgb(0.86, 0.15, 0.15), borderWidth: 1.5, color: rgb(1, 0.95, 0.95) });
    p0.drawText(label, { x: width - w - 20, y: height - 34, size: 16, font, color: rgb(0.86, 0.15, 0.15) });
  }

  // Copy into a plain ArrayBuffer-backed array so it satisfies BufferSource
  return new Uint8Array(await pdfDoc.save());
}

/** Full pipeline for one PDF file: render → AI mark → stamp. */
export async function markPaper(
  file: File,
  memoText: string,
  strictness: number,
  markTypes: MarkType[]
): Promise<MarkOutcome> {
  const original = new Uint8Array(await file.arrayBuffer());
  const pages    = await renderToImages(original);

  const res = await fetch("/api/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memoText,
      pages,
      strictness,
      markTypes: markTypes.map((m) => ({ abbrev: m.abbrev, label: m.label, shape: m.shape })),
    }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Marking failed");

  const data = await res.json();
  const bytes = await stampPdf(original, data.annotations ?? [], markTypes, data.total ?? 0, data.available ?? 0);

  return {
    bytes,
    total: data.total ?? 0,
    available: data.available ?? 0,
    percentage: data.percentage ?? 0,
    summary: data.summary ?? "",
  };
}
