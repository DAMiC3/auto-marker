import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient as createUserClient } from "@/lib/supabase/server";
import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";
import { costZar, type TokenUsage } from "@/lib/cost";
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

    // ── Metering pre-check ───────────────────────────────────────────────────
    let userId: string | null = null;
    if (isServiceConfigured()) {
      try {
        const sb = await createUserClient();
        const { data: { user } } = await sb.auth.getUser();
        userId = user?.id ?? null;
        if (userId) {
          const svc = createServiceClient();
          const { data: profile } = await svc
            .from("profiles").select("plan, allowance_cap_zar, used_zar, period_end").eq("id", userId).single();
          if (profile && profile.plan !== "none") {
            const capHit    = Number(profile.used_zar) >= Number(profile.allowance_cap_zar);
            const timeUp    = !!profile.period_end && new Date(profile.period_end) <= new Date();
            if (capHit || timeUp) {
              return NextResponse.json({ error: "allowance_exhausted" }, { status: 402 });
            }
          }
        }
      } catch (e) {
        console.error("Metering pre-check failed (continuing):", e);
      }
    }

    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: buildSystem(strictness, markTypes, subject),
      messages: [{ role: "user", content: buildContent(memoText, pages) }],
    });

    const raw    = (message.content[0] as { type: string; text: string }).text;
    const result = parseMarkResponse(raw);

    // ── Record usage ─────────────────────────────────────────────────────────
    if (isServiceConfigured() && userId) {
      try {
        const cost = costZar(model, message.usage as TokenUsage);
        const svc  = createServiceClient();
        await svc.rpc("add_usage", { p_user: userId, p_cost: cost, p_papers: 1, p_tier: quality, p_file: null });
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
