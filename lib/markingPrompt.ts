// Shared (server-side) marking prompt + content builders, used by both the
// instant route and the batch route so they stay identical.
import Anthropic from "@anthropic-ai/sdk";

// Hidden model mapping — the UI only ever says "Standard" / "High accuracy".
export const MODELS = {
  standard: "claude-sonnet-4-6",
  high:     "claude-opus-4-7",
} as const;

export type Quality = keyof typeof MODELS;

// A page is either extracted text (cheap) or a fallback image (for scans/diagrams).
export type PageContent =
  | { kind: "text"; text: string }
  | { kind: "image"; data: string };

export interface MarkTypeInput {
  abbrev: string;
  label: string;
  shape: string;
}

export interface Annotation {
  page: number;   // 1-based
  y: number;      // 0 (top) .. 1 (bottom)
  shape: string;
  marks: string;  // "n/m"
  comment: string;
}

export interface MarkResponse {
  total: number;
  available: number;
  percentage: number;
  annotations: Annotation[];
  summary: string;
}

export function buildSystem(
  strictness: number,
  markTypes: MarkTypeInput[],
  subject: string
): Anthropic.TextBlockParam[] {
  const shapeList = markTypes.map((m) => `"${m.shape}" (${m.abbrev} = ${m.label})`).join(", ");
  const subj = subject?.trim() ? `${subject.trim()} ` : "";

  const text = `You are an exam marker for university ${subj}tests. Your single job is to mark each student answer against the supplied MEMO (the official answer key) and award marks exactly as the memo dictates.

HOW TO MARK
- The memo is the only source of truth. Compare every answer to the memo and nothing else.
- Reward ACCURACY and CORRECTNESS, never writing style. A short, plainly written answer that contains the correct points earns full marks. A long, eloquent answer that misses the required points does NOT.
- Award partial marks for each correct point the memo allocates that is present in the answer.
- Apply strictness ${strictness}/10 (1 = lenient, generous partial credit; 10 = strict).

DO NOT HALLUCINATE
- Never invent facts, marks, questions, or content not present in the student's answer or the memo.
- Do not award marks for plausible-sounding content the memo does not support.
- If an answer is missing, unreadable, or off-topic, mark it 0 and say so plainly. Never guess.
- Every mark must be justifiable from evidence in the answer and the memo.

INPUT FORMAT
- The student's answers are given page by page as text. Each line is prefixed with [y=0.NN] — its vertical position on that page (0.00 = top, 1.00 = bottom).
- Some pages may be supplied as images instead (read them directly).

OUTPUT — for each answer you assess, produce one annotation. Use these SHORT keys to save space:
- "p": the page number the answer is on (starts at 1)
- "y": vertical position 0.0–1.0; use the [y=...] hints to place the mark next to the answer
- "s": the mark symbol, one of: ${shapeList}
- "m": awarded/available, e.g. "3/5"
- "c": a short factual margin note (max ~8 words)

Respond ONLY with valid JSON in exactly this shape, no prose outside it:
{
  "total": <sum of awarded marks>,
  "available": <sum of available marks>,
  "percentage": <rounded integer>,
  "annotations": [ { "p": 1, "y": 0.3, "s": "tick", "m": "3/5", "c": "Correct method" } ],
  "summary": "<2-3 factual sentences on overall performance>"
}`;

  return [{ type: "text", text, cache_control: { type: "ephemeral" } }];
}

export function buildContent(memoText: string, pages: PageContent[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `MEMO (answer key):\n${memoText || "(none provided)"}`,
      cache_control: { type: "ephemeral" },
    },
  ];

  pages.forEach((p, i) => {
    if (p.kind === "text") {
      blocks.push({ type: "text", text: `--- Page ${i + 1} ---\n${p.text}` });
    } else {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: "image/png", data: p.data },
      });
    }
  });

  blocks.push({ type: "text", text: "Mark the student's answers above against the memo. Return only the JSON." });
  return blocks;
}

export function parseMarkResponse(rawText: string): MarkResponse {
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const raw = JSON.parse(cleaned) as {
    total?: number; available?: number; percentage?: number; summary?: string;
    annotations?: { p?: number; y?: number; s?: string; m?: string; c?: string }[];
  };
  // Expand the short keys (p,y,s,m,c) back to the full annotation shape.
  return {
    total: raw.total ?? 0,
    available: raw.available ?? 0,
    percentage: raw.percentage ?? 0,
    summary: raw.summary ?? "",
    annotations: (raw.annotations ?? []).map((a) => ({
      page: a.p ?? 1,
      y: a.y ?? 0,
      shape: a.s ?? "tick",
      marks: a.m ?? "",
      comment: a.c ?? "",
    })),
  };
}

// Mock result used when no API key is configured (per-paper page count).
export function mockResult(pageCount: number, strictness: number): MarkResponse {
  const annotations: Annotation[] = [];
  for (let p = 1; p <= pageCount; p++) {
    annotations.push(
      { page: p, y: 0.22, shape: "tick",  marks: "5/5", comment: "Correct." },
      { page: p, y: 0.48, shape: "half",  marks: "1/2", comment: "Partly right." },
      { page: p, y: 0.74, shape: "cross", marks: "0/3", comment: "Incorrect." }
    );
  }
  return {
    total: 6, available: 10 * Math.max(1, pageCount), percentage: 60,
    annotations,
    summary: `Mock marking — add ANTHROPIC_API_KEY to enable real AI marking. Strictness ${strictness}/10.`,
  };
}
