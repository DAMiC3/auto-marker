import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";
import { costZar, type TokenUsage } from "@/lib/cost";

export const maxDuration = 60;

interface MarkTypeInput {
  abbrev: string;
  label: string;
  shape: string;
}

interface MarkRequest {
  memoText: string;
  pages: string[];                 // base64 PNG, one per page
  strictness: number;
  markTypes: MarkTypeInput[];
  quality?: "standard" | "high";   // maps to model tier (names hidden from UI)
}

interface Annotation {
  page: number;
  y: number;
  shape: string;
  marks: string;
  comment: string;
}

interface MarkResponse {
  total: number;
  available: number;
  percentage: number;
  annotations: Annotation[];
  summary: string;
}

// Hidden model mapping — the UI only ever says "Standard" / "High accuracy".
const MODELS = {
  standard: "claude-sonnet-4-5",
  high:     "claude-opus-4-5",
} as const;

function buildSystemPrompt(strictness: number, markTypes: MarkTypeInput[]): string {
  const shapeList = markTypes.map((m) => `"${m.shape}" (${m.abbrev} = ${m.label})`).join(", ");

  return `You are an exam marker for university tests. Your single job is to mark each student answer against the supplied MEMO (the official answer key) and award marks exactly as the memo dictates.

HOW TO MARK
- The memo is the only source of truth. Compare every answer to the memo and nothing else.
- Reward ACCURACY and CORRECTNESS, never writing style. A short, plainly written answer that contains the correct points earns full marks. A long, eloquent, confident answer that misses the required points does NOT earn marks.
- Award partial marks for each correct point the memo allocates that is present in the answer.
- Apply strictness ${strictness}/10 (1 = lenient, generous partial credit; 10 = strict, marks only for clearly correct points).

DO NOT HALLUCINATE
- Never invent facts, marks, questions, points, or content that is not actually present in the student's answer or the memo.
- Do not award marks for plausible-sounding content that the memo does not support.
- Do not be swayed by confident or fluent prose — verify each claim against the memo.
- If an answer is missing, unreadable, or off-topic, mark it 0 and say so plainly. Never guess a mark.
- Every mark you give must be justifiable from evidence in the answer and the memo.

OUTPUT
For each answer you assess, produce one annotation to stamp on the page:
- "page": 0-based page index the answer is on
- "y": vertical position of that answer, 0.0 (top) to 1.0 (bottom)
- "shape": the mark symbol to draw, one of: ${shapeList}
- "marks": awarded/available, e.g. "3/5"
- "comment": a short, factual margin note (max ~8 words)

Respond ONLY with valid JSON in exactly this shape, no prose outside it:
{
  "total": <sum of awarded marks>,
  "available": <sum of available marks>,
  "percentage": <rounded integer>,
  "annotations": [ { "page": 0, "y": 0.3, "shape": "tick", "marks": "3/5", "comment": "Correct method" } ],
  "summary": "<2-3 factual sentences on overall performance>"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as MarkRequest;
    const { memoText, pages, strictness, markTypes, quality = "standard" } = body;

    if (!pages || pages.length === 0) {
      return NextResponse.json({ error: "No pages to mark." }, { status: 400 });
    }

    // ── Mock fallback so the pipeline is testable without a key ──
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
    const model  = MODELS[quality] ?? MODELS.standard;

    // ── Metering: identify the user and check their allowance ────────────────
    // Gracefully no-ops if the service role key isn't configured yet.
    let userId: string | null = null;
    if (isServiceConfigured()) {
      try {
        const sb = await createUserClient();
        const { data: { user } } = await sb.auth.getUser();
        userId = user?.id ?? null;
        if (userId) {
          const svc = createServiceClient();
          const { data: profile } = await svc
            .from("profiles")
            .select("plan, allowance_cap_zar, used_zar")
            .eq("id", userId)
            .single();
          if (
            profile &&
            profile.plan !== "none" &&
            Number(profile.used_zar) >= Number(profile.allowance_cap_zar)
          ) {
            return NextResponse.json({ error: "allowance_exhausted" }, { status: 402 });
          }
        }
      } catch (e) {
        console.error("Metering pre-check failed (continuing):", e);
      }
    }

    // System prompt is constant across a batch → cache it.
    const system: Anthropic.TextBlockParam[] = [
      { type: "text", text: buildSystemPrompt(strictness, markTypes), cache_control: { type: "ephemeral" } },
    ];

    // Memo is constant across a batch → cache it (prefix before the per-paper images).
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text: `MEMO (answer key):\n${memoText || "(none provided)"}`,
        cache_control: { type: "ephemeral" },
      },
      ...pages.map((data) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: "image/png" as const, data },
      })),
      { type: "text", text: "Mark the student answer pages above against the memo. Return only the JSON." },
    ];

    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content }],
    });

    const raw     = (message.content[0] as { type: string; text: string }).text;
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const result  = JSON.parse(cleaned) as MarkResponse;

    // ── Metering: record the real cost of this run ───────────────────────────
    if (isServiceConfigured() && userId) {
      try {
        const cost = costZar(model, message.usage as TokenUsage);
        const svc  = createServiceClient();
        await svc.rpc("add_usage", {
          p_user: userId,
          p_cost: cost,
          p_papers: pages.length,
          p_tier: quality,
          p_file: null,
        });
      } catch (e) {
        console.error("Usage recording failed (continuing):", e);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Mark route error:", err);
    return NextResponse.json({ error: "Marking failed. Check server logs." }, { status: 500 });
  }
}
