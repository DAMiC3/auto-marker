import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import mammoth from "mammoth";

// ── PDF text extraction using pdfjs-dist (Node-compatible) ──────────────────
async function pdfToText(buf: Buffer): Promise<string> {
  // Dynamic import keeps build-time tree-shaking happy
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text    = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }

  return pages.join("\n");
}

// ── File → plain text ────────────────────────────────────────────────────────
async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buf  = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf")) {
    return pdfToText(buf);
  }

  if (name.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer: buf });
    return result.value;
  }

  // Plain text / .txt
  return buf.toString("utf-8");
}

// ── POST /api/mark ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const formData  = await req.formData();
    const memo      = formData.get("memo")    as File | null;
    const answers   = formData.get("answers") as File | null;
    const strictness = Number(formData.get("strictness") ?? 7);

    if (!memo || !answers) {
      return NextResponse.json(
        { error: "Both memo and answers files are required." },
        { status: 400 }
      );
    }

    // ── Mock fallback when no API key ────────────────────────────────────────
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        score: 18, total: 25, percentage: 72,
        feedback: [
          { question: "Question 1", awarded: 4, available: 5,  comment: "Good understanding. Lost 1 mark for incomplete explanation." },
          { question: "Question 2", awarded: 7, available: 10, comment: "Main points covered but analysis lacked depth." },
          { question: "Question 3", awarded: 7, available: 10, comment: "Strong answer. Well structured with relevant examples." },
        ],
        strictnessUsed: strictness,
        reasoning: `Mock result — add ANTHROPIC_API_KEY to .env.local to enable real marking. Strictness: ${strictness}/10.`,
      });
    }

    // ── Extract text from uploaded files ─────────────────────────────────────
    const [memoText, answersText] = await Promise.all([
      fileToText(memo),
      fileToText(answers),
    ]);

    // ── Call Claude ───────────────────────────────────────────────────────────
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = `You are an expert academic marker. You mark student answers strictly and fairly.
Strictness level: ${strictness}/10 (1=very lenient, partial credit freely given; 10=very strict, full marks only for complete correct answers).
Always show your reasoning so the lecturer can trust and override your marks.
Respond ONLY with valid JSON matching this exact shape:
{
  "score": <total awarded>,
  "total": <total available>,
  "percentage": <rounded integer>,
  "feedback": [
    { "question": "Question X", "awarded": <n>, "available": <n>, "comment": "<reasoning>" }
  ],
  "strictnessUsed": ${strictness},
  "reasoning": "<overall marking rationale>"
}`;

    const userPrompt = `MEMO (answer key):\n${memoText}\n\n---\n\nSTUDENT ANSWERS:\n${answersText}`;

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw     = (message.content[0] as { type: string; text: string }).text;
    // Strip any markdown code fences Claude might add
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const result  = JSON.parse(cleaned);

    return NextResponse.json(result);

  } catch (err) {
    console.error("Mark route error:", err);
    return NextResponse.json({ error: "Marking failed. Check server logs." }, { status: 500 });
  }
}
