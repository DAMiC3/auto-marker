import { NextRequest, NextResponse } from "next/server";

// TODO: wire up Claude API when key is available
// import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const memo = formData.get("memo") as File | null;
    const answers = formData.get("answers") as File | null;
    const strictness = Number(formData.get("strictness") ?? 7);

    if (!memo || !answers) {
      return NextResponse.json(
        { error: "Both memo and answers files are required." },
        { status: 400 }
      );
    }

    // ── PLACEHOLDER RESPONSE (replace with Claude API call) ──
    // const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // ... call client.messages.create(...)

    const mockResult = {
      score: 18,
      total: 25,
      percentage: 72,
      feedback: [
        {
          question: "Question 1",
          awarded: 4,
          available: 5,
          comment: "Good understanding shown. Lost 1 mark for incomplete explanation.",
        },
        {
          question: "Question 2",
          awarded: 7,
          available: 10,
          comment: "Main points covered but analysis lacked depth. See memo for expected points.",
        },
        {
          question: "Question 3",
          awarded: 7,
          available: 10,
          comment: "Strong answer. Well structured with relevant examples.",
        },
      ],
      strictnessUsed: strictness,
      reasoning:
        "Marks awarded based on key concept inclusion. Strictness level " +
        strictness +
        "/10 applied — partial credit given where core ideas present but explanation incomplete.",
    };

    return NextResponse.json(mockResult);
  } catch (err) {
    console.error("Mark route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
