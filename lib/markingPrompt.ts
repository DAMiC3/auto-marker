// Shared (server-side) marking prompt + content builders, used by both the
// instant route and the batch route so they stay identical.
import Anthropic from "@anthropic-ai/sdk";

// Hidden model mapping — the UI only ever says "Standard" / "High accuracy".
export const MODELS = {
  standard: "claude-sonnet-4-6",
  high:     "claude-opus-4-7",
} as const;

export type Quality = keyof typeof MODELS;

// Output-token ceiling for a single marking call. Each annotation is tiny in the
// short-key form (~30–40 tokens), so 16k leaves room for ~400 annotations plus the
// summary — far beyond any real paper. The old 4096 cap truncated the JSON on long
// papers, dropping the later annotations so the bottom of the test came back
// unmarked (P2-4 / P5-3). 16k is the safe non-streaming default; both models
// (sonnet-4-6 → 64k, opus-4-7 → 128k) support far more if ever needed.
export const MAX_OUTPUT_TOKENS = 16000;

// P5-4: explicit retry budget for the Anthropic client. The SDK retries 429s,
// 408/409/5xx and connection errors with exponential backoff + jitter; without
// setting this we silently rely on the SDK default (2). 4 gives a rate-limit
// storm more room to clear before surfacing a raw 500 to the user. Marking calls
// are idempotent (no state written before the response), so retrying is safe.
export const MAX_RETRIES = 4;

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

// P5-5: the UI slider stays 1–10, but a bare "{n}/10" is too subjective to mark
// consistently. Resolve it to one of three calibrated bands. The throughline in
// every band: the slider changes how much benefit-of-the-doubt an answer's WORDING
// and completeness earn — it is NEVER licence to award marks the memo does not
// support (lenient) or to invent faults and dock memo-earned marks (strict).
export function strictnessGuidance(strictness: number): string {
  if (strictness <= 4) {
    return `Marking stance: LENIENT. Give the student the benefit of the doubt on expression: award the mark when the answer clearly conveys the memo's required point, even if it is worded imprecisely, uses equivalent terminology, or is briefly stated. Be generous with partial marks for each memo point that is present in substance. Leniency applies ONLY to how an answer is phrased — it is never a reason to award marks the memo does not support. Do not award any marks for content that is absent, off-topic, or simply wrong, no matter how lenient the stance.`;
  }
  if (strictness <= 7) {
    return `Marking stance: MODERATE. Apply a balanced standard. Award the mark when the answer contains the memo's required point with reasonable accuracy and completeness, in the student's own words. Award partial marks in proportion to how many of the memo's required points are genuinely present. Do not treat vague, incomplete, or only partly-correct answers as fully correct, and never award marks for content the memo does not support.`;
  }
  return `Marking stance: STRICT. Hold a high bar for correctness. Award the mark only when the answer matches the memo accurately and completely, using the correct terms and covering all required elements. Withhold marks where the answer is vague, incomplete, partly correct, or only gestures at the right idea. Being strict means demanding precision — it does NOT mean inventing faults or deducting marks the memo would award; an answer that fully and correctly meets the memo still earns full marks.`;
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
- ${strictnessGuidance(strictness)}

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
  let s = rawText.trim();
  // Prefer a fenced ```json ... ``` block if present
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Otherwise slice first { to last } — tolerates any prose around the JSON
  // (e.g. the model saying "I don't see student answers… { … }").
  const open = s.indexOf("{");
  const close = s.lastIndexOf("}");
  if (open === -1 || close === -1 || close < open) {
    throw new Error("No JSON object found in the model response.");
  }
  const raw = JSON.parse(s.slice(open, close + 1)) as {
    total?: number; available?: number; percentage?: number; summary?: string;
    annotations?: { p?: number; y?: number; s?: string; m?: string; c?: string }[];
  };
  // Expand the short keys (p,y,s,m,c) back to the full annotation shape.
  const total = raw.total ?? 0;
  const available = raw.available ?? 0;
  return {
    total,
    available,
    // P5-2: compute the percentage from the marks rather than trusting the
    // model's self-reported value, which can be internally inconsistent with
    // total/available. Guard against divide-by-zero (no available marks → 0%).
    percentage: available > 0 ? Math.round((total / available) * 100) : 0,
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
