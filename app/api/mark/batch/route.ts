import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";
import { costZar, type TokenUsage } from "@/lib/cost";
import {
  MODELS, type PageContent, type MarkTypeInput,
  buildSystem, buildContent, parseMarkResponse, mockResult, type MarkResponse,
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

    // Mock: return results immediately, keyed by customId (no polling needed)
    if (!process.env.ANTHROPIC_API_KEY) {
      const results: Record<string, MarkResponse> = {};
      for (const p of papers) results[p.customId] = mockResult(p.pages.length, strictness);
      return NextResponse.json({ status: "ended", results });
    }

    // Allowance pre-check (once for the whole batch)
    const userId = await getUserId();
    if (userId) {
      const svc = createServiceClient();
      const { data: profile } = await svc
        .from("profiles").select("plan, allowance_cap_zar, used_zar").eq("id", userId).single();
      if (profile && profile.plan !== "none" && Number(profile.used_zar) >= Number(profile.allowance_cap_zar)) {
        return NextResponse.json({ error: "allowance_exhausted" }, { status: 402 });
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
        totalCost += costZar(model, msg.usage as TokenUsage);
      } else {
        results[cid] = { error: "Marking failed for this paper." };
      }
    }

    // Record total usage once
    if (isServiceConfigured() && totalCost > 0) {
      const userId = await getUserId();
      if (userId) {
        try {
          const svc = createServiceClient();
          await svc.rpc("add_usage", {
            p_user: userId,
            p_cost: totalCost,
            p_papers: Object.keys(results).length,
            p_tier: quality,
            p_file: null,
          });
        } catch (e) {
          console.error("Batch usage recording failed (continuing):", e);
        }
      }
    }

    return NextResponse.json({ status: "ended", results });
  } catch (err) {
    console.error("Batch poll error:", err);
    return NextResponse.json({ error: "Batch retrieval failed." }, { status: 500 });
  }
}
