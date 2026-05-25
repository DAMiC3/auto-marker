import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

interface MarkTypeInput {
  abbrev: string;
  label: string;
  shape: string;
}

interface MarkRequest {
  memoText: string;
  pages: string[];          // base64 PNG, one per page
  strictness: number;
  markTypes: MarkTypeInput[];
}

// One mark the AI wants stamped on the paper
interface Annotation {
  page: number;             // 0-based page index
  y: number;                // 0 (top) .. 1 (bottom) — vertical position
  shape: string;            // one of the mark-type shapes
  marks: string;            // e.g. "3/5"
  comment: string;          // short margin note
}

interface MarkResponse {
  total: number;
  available: number;
  percentage: number;
  annotations: Annotation[];
  summary: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as MarkRequest;
    const { memoText, pages, strictness, markTypes } = body;

    if (!pages || pages.length === 0) {
      return NextResponse.json({ error: "No pages to mark." }, { status: 400 });
    }

    // ── Mock fallback so the stamp + move pipeline is testable without a key ──
    if (!process.env.ANTHROPIC_API_KEY) {
      const annotations: Annotation[] = pages.flatMap((_, p) => [
        { page: p, y: 0.22, shape: "tick",  marks: "5/5", comment: "Correct." },
        { page: p, y: 0.48, shape: "half",  marks: "1/2", comment: "Partly right." },
        { page: p, y: 0.74, shape: "cross", marks: "0/3", comment: "Incorrect." },
      ]);
      return NextResponse.json({
        total: 6, available: 10 * pages.length, percentage: 60,
        annotations,
        summary: `Mock marking — add ANTHROPIC_API_KEY to enable real AI marking. Strictness ${strictness}/10.`,
      } satisfies MarkResponse);
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const shapeList = markTypes.map((m) => `"${m.shape}" (${m.abbrev} = ${m.label})`).join(", ");

    const systemPrompt = `You are an experienced university examiner marking a student's test paper.
You are given the MEMO (answer key) and images of each page of the student's answers.
Mark like a real human marker: judge each answer against the memo and decide marks.

Strictness: ${strictness}/10 (1 = very lenient, generous partial credit; 10 = very strict).

For every answer you assess, produce one annotation describing the mark to stamp on the page:
- "page": 0-based index of the page the answer is on
- "y": vertical position of that answer on the page, 0.0 (very top) to 1.0 (very bottom)
- "shape": the mark symbol to draw, one of: ${shapeList}
- "marks": awarded over available, e.g. "3/5"
- "comment": a very short margin note (max ~8 words)

Respond ONLY with valid JSON in exactly this shape:
{
  "total": <sum of awarded marks>,
  "available": <sum of available marks>,
  "percentage": <rounded integer>,
  "annotations": [ { "page": 0, "y": 0.3, "shape": "tick", "marks": "3/5", "comment": "Good method" } ],
  "summary": "<2-3 sentence overall assessment>"
}`;

    const content: Anthropic.MessageParam["content"] = [
      { type: "text", text: `MEMO (answer key):\n${memoText || "(none provided)"}\n\nStudent answer pages follow, in order.` },
      ...pages.map((data) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: "image/png" as const, data },
      })),
    ];

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content }],
    });

    const raw     = (message.content[0] as { type: string; text: string }).text;
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const result  = JSON.parse(cleaned) as MarkResponse;

    return NextResponse.json(result);
  } catch (err) {
    console.error("Mark route error:", err);
    return NextResponse.json({ error: "Marking failed. Check server logs." }, { status: 500 });
  }
}
