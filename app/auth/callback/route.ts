import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Landing point for every auth email link (sign-up confirmation, recovery,
// magic link). It establishes a session, then forwards to a *friendly* page —
// never a bare error URL (P3-9).
//
// Two link flavours are handled:
//   • PKCE        → `?code=…`            → exchangeCodeForSession
//   • OTP/verify  → `?token_hash=…&type` → verifyOtp
// Which one arrives depends on the Supabase email-template config; supporting
// both means branding the templates can't silently break the flow.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type"); // signup | recovery | email | magiclink | …
  const next = searchParams.get("next");

  const isRecovery = type === "recovery" || next === "/reset-password";

  let ok = false;
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
    ok = !error;
  }

  // Recovery: hand off to the set-new-password page. It re-checks the session
  // itself and shows a clear "link invalid/expired" state if `ok` was false
  // (e.g. the link was opened in a different browser), so no error URL needed.
  if (isRecovery) {
    return NextResponse.redirect(`${origin}/reset-password`);
  }

  // Sign-up / email confirmation: always land on the celebratory page. Even when
  // the session exchange fails — typically because the link was opened on a
  // different device than sign-up (the PKCE verifier cookie isn't there) — the
  // email itself IS now verified by Supabase. So we confirm success and just ask
  // them to sign in, instead of dumping them on /login?error=auth (which looked
  // broken even though everything worked).
  const dest = new URL(`${origin}/auth/confirmed`);
  if (!ok) dest.searchParams.set("signin", "1");
  return NextResponse.redirect(dest.toString());
}
