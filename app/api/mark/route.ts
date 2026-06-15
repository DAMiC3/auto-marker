import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { isServiceConfigured } from "@/lib/supabase/service";
import { costZar, type TokenUsage } from "@/lib/cost";
import { checkAllowance, recordUsage } from "@/lib/usage";
import {
  MODELS, type PageContent, type MarkTypeInput,
  buildSystem, buildContent, parseMarkResponse,
} from "@/lib/markingPrompt";

export const maxDuration = 60;

interface MarkRequest {
  memoText: string;
  subject: string;
  strictness: number;
  quality?: "standard" | "high";
  markTypes: MarkTypeInput[];
  pages: PageContent[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as MarkRequest;
    const { memoText, subject, strictness, markTypes, pages, quality = "standard" } = body;

    if (!pages || pages.length === 0) {
      return NextResponse.json({ error: "No pages to mark." }, { status: 400 });
    }

    // No silent mock — if the key is missing, fail clearly rather than stamp fake marks.
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI marking isn’t configured (missing API key). No marks were applied." },
        { status: 503 }
      );
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model  = MODELS[quality] ?? MODELS.standard;

    // ── Metering pre-check (fail-CLOSED; see lib/usage.checkAllowance) ────────
    // If the allowance can't be verified (auth or DB error), marking is BLOCKED —
    // we never mark blind. The gate pages ops on genuine backend failures.
    const gate = await checkAllowance();
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const userId = gate.userId;

    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: buildSystem(strictness, markTypes, subject),
      messages: [{ role: "user", content: buildContent(memoText, pages) }],
    });

    const raw    = (message.content[0] as { type: string; text: string }).text;
    const result = parseMarkResponse(raw);

    // ── Record usage (retries + loud failure log) ────────────────────────────
    if (isServiceConfigured() && userId) {
      const cost = costZar(model, message.usage as TokenUsage);
      await recordUsage(userId, cost, 1, quality);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Mark route error:", err);
    return NextResponse.json({ error: "Marking failed. Check server logs." }, { status: 500 });
  }
}
