import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient, isServiceConfigured } from "@/lib/supabase/service";

// P7-8: POPIA data-access export. Returns the BARE MINIMUM personal data we hold
// on the caller as a raw CSV — their identity, plan window, and activity log.
// Deliberately excludes internal Rand cost (ADR-002: never show the user Rand) and
// any accounting/revenue records (those are the business's books, not the user's data).
// Low-key by design: reachable from Settings → Advanced, not advertised.

// RFC-4180 field escaping: quote anything containing a comma, quote, or newline.
function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: unknown[]): string {
  return cells.map(csvField).join(",");
}

export async function GET() {
  if (!isServiceConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Identify the caller from their own session — they only ever export themselves.
  let userId: string | null = null;
  let email = "";
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    userId = user?.id ?? null;
    email = user?.email ?? "";
  } catch {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const svc = createServiceClient();

  // Identity + plan window (no allowance_cap/used — those are Rand internals).
  const { data: profile } = await svc
    .from("profiles")
    .select("full_name, plan, period_start, period_end")
    .eq("id", userId)
    .single();

  // Activity log: date + paper count + quality tier. No cost, no file names.
  const { data: usage } = await svc
    .from("usage_events")
    .select("created_at, papers, model_tier")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  const lines: string[] = [];
  lines.push("# AutoMark — your data export");
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("[Account]");
  lines.push(csvRow(["field", "value"]));
  lines.push(csvRow(["Name", profile?.full_name ?? ""]));
  lines.push(csvRow(["Email", email]));
  lines.push(csvRow(["Plan", profile?.plan ?? ""]));
  lines.push(csvRow(["Plan start", profile?.period_start ?? ""]));
  lines.push(csvRow(["Plan end", profile?.period_end ?? ""]));
  lines.push("");
  lines.push("[Marking activity]");
  lines.push(csvRow(["date", "papers", "quality"]));
  for (const e of usage ?? []) {
    lines.push(csvRow([e.created_at, e.papers, e.model_tier]));
  }
  const csv = lines.join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="automark-data-export.csv"',
      "Cache-Control": "no-store",
    },
  });
}
