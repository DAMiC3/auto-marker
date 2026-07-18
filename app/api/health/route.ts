import { NextResponse } from "next/server";

// Liveness probe for an EXTERNAL uptime monitor (e.g. UptimeRobot). It returns
// 200 whenever the Worker is running — so "no response / 5xx / Cloudflare error"
// from an off-Cloudflare monitor means the app/hosting is down, closing the one
// outage the in-Worker `notifyOps` alerting can't see (it can't fire if the
// Worker itself is down). Deliberately CHEAP and dependency-free: it does NOT
// touch Supabase/Anthropic, so it reflects hosting liveness only and can't raise
// a false "down" when a backend blips (those are already handled gracefully).
// Middleware short-circuits this path before the auth/Supabase check.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { ok: true, ts: Date.now() },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
