// Reproduce the marking call against the real test PDFs and print Claude's raw reply.
import * as pdfjs from "../node_modules/pdfjs-dist/legacy/build/pdf.mjs";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
const KEY = (env.match(/^ANTHROPIC_API_KEY=(.*)$/m) || [])[1]?.trim();
const client = new Anthropic({ apiKey: KEY });

async function pagesText(file) {
  const data = new Uint8Array(readFileSync(file));
  const pdf = await pdfjs.getDocument({ data }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const H = page.getViewport({ scale: 1 }).height;
    const items = (await page.getTextContent()).items.filter((it) => it.str?.trim() && it.transform);
    const lines = [];
    for (const it of items) {
      const y = 1 - it.transform[5] / H;
      let ln = lines.find((l) => Math.abs(l.y - y) < 0.012);
      if (!ln) { ln = { y, parts: [] }; lines.push(ln); }
      ln.parts.push({ x: it.transform[4], s: it.str });
    }
    lines.sort((a, b) => a.y - b.y);
    out.push(lines.map((l) => `[y=${l.y.toFixed(2)}] ${l.parts.sort((a,b)=>a.x-b.x).map(p=>p.s).join(" ")}`).join("\n"));
  }
  return out;
}
async function plain(file) {
  const data = new Uint8Array(readFileSync(file));
  const pdf = await pdfjs.getDocument({ data }).promise;
  let s = "";
  for (let i = 1; i <= pdf.numPages; i++) s += (await pdf.getPage(i)).getTextContent ? "" : "";
  for (let i = 1; i <= pdf.numPages; i++) s += (await (await pdf.getPage(i)).getTextContent()).items.map((it)=>it.str).join(" ") + "\n";
  return s;
}

const SHAPES = '"tick" (M = Full mark), "half" (½ = Half mark), "cross" (X = Incorrect)';
const SYSTEM = `You are an exam marker for university Taxation tests. Mark each student answer against the supplied MEMO and award marks exactly as the memo dictates.
Reward accuracy, never style. Apply strictness 7/10. Never invent marks. If an answer is missing/unreadable, mark it 0.
For each answer output one annotation with SHORT keys: "p" (page, from 1), "y" (0..1), "s" (one of: ${SHAPES}), "m" ("3/5"), "c" (<=8 words).
Respond ONLY with valid JSON: { "total":n, "available":n, "percentage":n, "annotations":[...], "summary":"..." }`;

const memo = await plain("C:\\Users\\Michael Bernard\\TestPapers\\Memo.pdf");

for (const name of ["Memo.pdf", "Student_A.pdf", "Student_B.pdf"]) {
  const pages = await pagesText("C:\\Users\\Michael Bernard\\TestPapers\\Inbox\\" + name);
  const content = [
    { type: "text", text: `MEMO (answer key):\n${memo}`, cache_control: { type: "ephemeral" } },
    ...pages.map((t, i) => ({ type: "text", text: `--- Page ${i + 1} ---\n${t}` })),
    { type: "text", text: "Mark the student's answers above against the memo. Return only the JSON." },
  ];
  const msg = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content }],
  });
  const raw = msg.content[0].text;
  console.log(`\n========== ${name} ==========`);
  console.log("RAW (first 400 chars):", raw.slice(0, 400));
}
