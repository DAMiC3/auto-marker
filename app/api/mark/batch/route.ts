import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { isServiceConfigured } from "@/lib/supabase/service";
import { costZarBatch, type TokenUsage } from "@/lib/cost";
import { recordUsage, estimateBatchCostZar, checkAllowance, type PaperPageSummary } from "@/lib/usage";
import {
  MODELS, type PageContent, type MarkTypeInput,
  buildSystem, buildContent, parseMarkResponse, type MarkResponse,
} from "@/lib/markingPrompt";

export const maxDuration = 60;

interface PaperInput {
  customId: string;
  pages: PageContent[];
}

interface BatchRequest {
  memoText: string;
  subject: string;
  strictness: number;
  quality?: "standard" | "high";
  markTypes: MarkTypeInput[];
  papers: PaperInput[];
}

async function getUserId(): Promise<string | null> {
  if (!isServiceConfigured()) return null;
  try {
    const sb = await createUserClient();
    const { data: { user } } = await sb.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

// ── Submit a batch ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BatchRequest;
    const { memoText, subject, strictness, markTypes, papers, quality = "standard" } = body;

    if (!papers || papers.length === 0) {
      return NextResponse.json({ error: "No papers to mark." }, { status: 400 });
    }

    // No silent mock — fail clearly if the key is missing.
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "AI marking isn’t configured (missing API key)." },
        { status: 503 }
      );
    }

    // Allowance pre-check (fail-CLOSED; once for the whole batch). If the allowance
    // can't be verified (auth or DB error), the batch is BLOCKED — we never submit
    // blind. The gate pages ops on genuine backend failures.
    const gate = await checkAllowance();
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const { profile } = gate;

    // Pre-flight: a batch is submitted to Anthropic in one shot, so the only
    // chance to stop an overspend is before we send it. Estimate the cost and
    // refuse if it would blow past what's left on the plan.
    if (profile) {
      const remaining = Number(profile.allowance_cap_zar) - Number(profile.used_zar);
      const pageSummaries: PaperPageSummary[] = papers.map((p) => ({
        textPages:  p.pages.filter((pg) => pg.kind === "text").length,
        imagePages: p.pages.filter((pg) => pg.kind === "image").length,
      }));
      const estimate = estimateBatchCostZar(pageSummaries, quality);
      if (estimate > remaining) {
        const perPaperAvg = estimate / papers.length;
        const affordable = Math.max(0, Math.floor(remaining / perPaperAvg));
        return NextResponse.json(
          {
            error: "allowance_exhausted",
            detail: `This batch of ${papers.length} papers would exceed your remaining allowance. You can mark about ${affordable} more paper(s) on this plan — split the batch or upgrade.`,
            affordable,
          },
          { status: 402 },
        );
      }
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model  = MODELS[quality] ?? MODELS.standard;

    const requests = papers.map((p) => ({
      custom_id: p.customId,
      params: {
        model,
        max_tokens: 4096,
        system: buildSystem(strictness, markTypes, subject),
        messages: [{ role: "user" as const, content: buildContent(memoText, p.pages) }],
      },
    }));

    const batch = await client.messages.batches.create({ requests });
    return NextResponse.json({ status: "submitted", batchId: batch.id, quality });
  } catch (err) {
    console.error("Batch submit error:", err);
    return NextResponse.json({ error: "Batch submission failed." }, { status: 500 });
  }
}

// ── Poll / retrieve a batch ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const id      = req.nextUrl.searchParams.get("id");
    const quality = (req.nextUrl.searchParams.get("quality") ?? "standard") as "standard" | "high";
    if (!id) return NextResponse.json({ error: "Missing batch id." }, { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "No API key." }, { status: 400 });
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const batch  = await client.messages.batches.retrieve(id);

    if (batch.processing_status !== "ended") {
      return NextResponse.json({ status: "processing", counts: batch.request_counts });
    }

    const model = MODELS[quality] ?? MODELS.standard;
    const results: Record<string, MarkResponse | { error: string }> = {};
    let totalCost = 0;

    for await (const entry of await client.messages.batches.results(id)) {
      const cid = entry.custom_id;
      if (entry.result.type === "succeeded") {
        const msg = entry.result.message;
        try {
          const text = (msg.content[0] as { type: string; text: string }).text;
          results[cid] = parseMarkResponse(text);
        } catch {
          results[cid] = { error: "Could not parse marking result." };
        }
        totalCost += costZarBatch(model, msg.usage as TokenUsage);
      } else {
        results[cid] = { error: "Marking failed for this paper." };
      }
    }

    // Record total usage once (retries + loud failure log)
    if (isServiceConfigured() && totalCost > 0) {
      const userId = await getUserId();
      if (userId) {
        await recordUsage(userId, totalCost, Object.keys(results).length, quality);
      }
    }

    return NextResponse.json({ status: "ended", results });
  } catch (err) {
    console.error("Batch poll error:", err);
    return NextResponse.json({ error: "Batch retrieval failed." }, { status: 500 });
  }
}
