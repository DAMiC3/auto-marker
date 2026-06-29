// Reproduce the marking call against the real test PDFs and print Claude's raw reply.
//
// Run:  node --experimental-strip-types scripts/debug-mark.mts
//
// P5-8: this script imports the LIVE prompt builders from lib/markingPrompt.ts
// (buildSystem / buildContent / MODELS / MAX_OUTPUT_TOKENS / MAX_RETRIES) so it can
// never drift from what the app actually sends. If the prompt changes, this changes
// with it. The only things hard-coded here are the test-harness inputs (which test
// PDFs to read, and a representative subject/mark-types/strictness) — never the prompt.
import * as pdfjs from "../node_modules/pdfjs-dist/legacy/build/pdf.mjs";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import {
  MODELS, MAX_OUTPUT_TOKENS, MAX_RETRIES, type PageContent, type MarkTypeInput,
  buildSystem, buildContent,
} from "../lib/markingPrompt.ts";

const env = readFileSync(".env.local", "utf8");
const KEY = (env.match(/^ANTHROPIC_API_KEY=(.*)$/m) || [])[1]?.trim();
const client = new Anthropic({ apiKey: KEY, maxRetries: MAX_RETRIES });

// Representative settings for the repro (NOT the prompt — the prompt comes from buildSystem).
const SUBJECT = "Taxation";
const STRICTNESS = 7;
const MARK_TYPES: MarkTypeInput[] = [
  { abbrev: "M", label: "Full mark", shape: "tick" },
  { abbrev: "½", label: "Half mark", shape: "half" },
  { abbrev: "X", label: "Incorrect", shape: "cross" },
];

async function pagesText(file: string): Promise<string[]> {
  const data = new Uint8Array(readFileSync(file));
  const pdf = await pdfjs.getDocument({ data }).promise;
  const out: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const H = page.getViewport({ scale: 1 }).height;
    const items: any[] = (await page.getTextContent()).items.filter((it: any) => it.str?.trim() && it.transform);
    const lines: { y: number; parts: { x: number; s: string }[] }[] = [];
    for (const it of items) {
      const y = 1 - it.transform[5] / H;
      let ln = lines.find((l) => Math.abs(l.y - y) < 0.012);
      if (!ln) { ln = { y, parts: [] }; lines.push(ln); }
      ln.parts.push({ x: it.transform[4], s: it.str });
    }
    lines.sort((a, b) => a.y - b.y);
    out.push(lines.map((l) => `[y=${l.y.toFixed(2)}] ${l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(" ")}`).join("\n"));
  }
  return out;
}

async function plain(file: string): Promise<string> {
  const data = new Uint8Array(readFileSync(file));
  const pdf = await pdfjs.getDocument({ data }).promise;
  let s = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    s += (await (await pdf.getPage(i)).getTextContent()).items.map((it: any) => it.str).join(" ") + "\n";
  }
  return s;
}

const memo = await plain("C:\\Users\\Michael Bernard\\TestPapers\\Memo.pdf");
const system = buildSystem(STRICTNESS, MARK_TYPES, SUBJECT);

for (const name of ["Memo.pdf", "Student_A.pdf", "Student_B.pdf"]) {
  const pages = await pagesText("C:\\Users\\Michael Bernard\\TestPapers\\Inbox\\" + name);
  const pageContent: PageContent[] = pages.map((t) => ({ kind: "text", text: t }));
  const msg = await client.messages.create({
    model: MODELS.standard,
    max_tokens: MAX_OUTPUT_TOKENS,
    system,
    messages: [{ role: "user", content: buildContent(memo, pageContent) }],
  });
  const raw = (msg.content[0] as { type: string; text: string }).text;
  console.log(`\n========== ${name} ==========`);
  console.log("RAW (first 400 chars):", raw.slice(0, 400));
}
