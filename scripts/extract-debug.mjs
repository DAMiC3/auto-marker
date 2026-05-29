// Debug: replicate the app's per-page text extraction for the test PDFs
import * as pdfjs from "../node_modules/pdfjs-dist/legacy/build/pdf.mjs";
import { readFileSync } from "fs";

async function extract(file) {
  const data = new Uint8Array(readFileSync(file));
  const pdf = await pdfjs.getDocument({ data }).promise;
  let out = `\n===== ${file} (${pdf.numPages} pages) =====\n`;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items.filter((it) => typeof it.str === "string" && it.str.trim() && it.transform);
    const H = vp.height;
    const lines = [];
    for (const it of items) {
      const y = 1 - it.transform[5] / H;
      let ln = lines.find((l) => Math.abs(l.y - y) < 0.012);
      if (!ln) { ln = { y, parts: [] }; lines.push(ln); }
      ln.parts.push({ x: it.transform[4], s: it.str });
    }
    lines.sort((a, b) => a.y - b.y);
    out += `--- page ${i}: ${items.length} text items ---\n`;
    out += lines.map((l) => `[y=${l.y.toFixed(2)}] ${l.parts.sort((a,b)=>a.x-b.x).map(p=>p.s).join(" ").replace(/\s+/g," ").trim()}`).join("\n");
    out += "\n";
  }
  return out;
}

const base = "C:\\Users\\Michael Bernard\\TestPapers\\Inbox\\";
console.log(await extract(base + "Student_A.pdf"));
console.log(await extract(base + "Student_B.pdf"));
