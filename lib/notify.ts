// Server-only operational alerts (e.g. "Supabase write failed").
// Sends a push to OPS_ALERT_WEBHOOK_URL if configured, and always logs so the
// alert is in Cloudflare observability either way. Never throws — a failed
// notification must not break the request that triggered it.
//
// Quick setup (recommended): create a free ntfy.sh topic and set the secret:
//   npx wrangler secret put OPS_ALERT_WEBHOOK_URL   →  https://ntfy.sh/<your-topic>
// Subscribe to that topic in the ntfy app to get phone pushes.
// (For Slack/Discord, point it at their incoming-webhook URL — note those expect
//  a JSON body like {"text": "..."} / {"content": "..."}; tweak the fetch below.)

export async function notifyOps(message: string): Promise<void> {
  // Always log — this is the durable record in Workers observability.
  console.error(`OPS ALERT: ${message}`);

  const url = process.env.OPS_ALERT_WEBHOOK_URL;
  if (!url) return; // no channel wired yet → log-only, which is fine

  try {
    await fetch(url, {
      method: "POST",
      // Plain-text body works for ntfy.sh out of the box.
      headers: { "Content-Type": "text/plain" },
      body: `AutoMark: ${message}`,
    });
  } catch (e) {
    console.error("notifyOps: failed to deliver alert:", e);
  }
}
