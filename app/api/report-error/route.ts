import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyOps } from "@/lib/notify";

// Client-side error reporter (P3-8). When the UI hits an *unrecognized* error it
// shows the user a generic message and POSTs the raw detail here. We attach who
// hit it (from the session cookie) and push it to the founder via notifyOps
// (OPS_ALERT_WEBHOOK_URL → e.g. the ntfy "Bernard & CO" app). Best-effort: this
// route never fails the caller — reporting must not cascade into more errors.
export async function POST(req: NextRequest) {
  let detail = "";
  let context = "";
  try {
    const body = (await req.json()) as { detail?: unknown; context?: unknown };
    if (typeof body.detail === "string") detail = body.detail.slice(0, 500);
    if (typeof body.context === "string") context = body.context.slice(0, 80);
  } catch {
    // malformed body — still report what we can
  }

  // Who hit it — best-effort from the cookie-bound session.
  let who = "an unidentified user";
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) who = user.email ?? user.id;
  } catch {
    // identity is best-effort; never block the alert on it
  }

  await notifyOps(
    `error hit by ${who}${context ? ` during “${context}”` : ""}: ${detail || "(no detail)"}`,
  );

  return NextResponse.json({ ok: true });
}
