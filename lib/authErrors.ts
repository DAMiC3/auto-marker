// Friendly messages for Supabase auth errors on the login / reset surfaces.
// The marking page has its own friendlyError() (app/page.tsx) for the marking
// pipeline; this is the auth-surface counterpart, so users never see raw GoTrue
// strings like "email rate limit exceeded" or "For security purposes, you can
// only request this after 52 seconds".
export function authErrorMessage(raw: string): string {
  const r = (raw || "").toLowerCase();

  // Too many emails (Supabase's hourly email cap or per-address send throttle).
  if (
    r.includes("rate limit") ||
    r.includes("you can only request this after") ||
    r.includes("for security purposes")
  )
    return "Too many emails have been requested recently. Please wait a little while, then try again.";

  if (r.includes("invalid login credentials") || r.includes("invalid email or password"))
    return "That email or password is incorrect. Please try again.";

  if (r.includes("email not confirmed") || r.includes("not confirmed"))
    return "Please confirm your email first — check your inbox for the verification link we sent.";

  if (r.includes("already registered") || r.includes("already exists") || r.includes("user already"))
    return "An account with that email already exists. Try signing in instead.";

  if (r.includes("password should be") || r.includes("at least") || r.includes("too short"))
    return "Please choose a longer password (at least 6 characters).";

  if (r.includes("expired") || r.includes("invalid") )
    return "That link is invalid or has expired. Please request a new one.";

  if (r.includes("failed to fetch") || r.includes("network") || r.includes("load failed"))
    return "We couldn’t reach the server — check your internet connection and try again.";

  // Fallback: short GoTrue messages are usually readable; anything long/odd gets
  // a generic line instead of leaking internals.
  return raw && raw.length > 0 && raw.length < 120
    ? raw
    : "Something went wrong. Please try again in a moment.";
}
