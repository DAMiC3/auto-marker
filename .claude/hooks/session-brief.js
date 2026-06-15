// UserPromptSubmit hook: inject a one-time "where are we" briefing per session.
// Fires only on the FIRST prompt of each session (keyed by session_id from stdin).
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function main() {
  let payload = {};
  try {
    payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  } catch (_) {}

  const sessionId = payload.session_id || "unknown";
  const cwd = payload.cwd || process.cwd();
  const flag = path.join(cwd, ".claude", `.brief-${sessionId}`);

  // Already briefed this session — emit nothing.
  if (fs.existsSync(flag)) return;
  try {
    fs.writeFileSync(flag, new Date().toISOString());
  } catch (_) {}

  let log = "",
    st = "";
  try {
    log = execSync("git log --oneline -3", { cwd }).toString().trim();
  } catch (_) {}
  try {
    st = execSync("git status --short", { cwd }).toString().trim();
  } catch (_) {}

  const text =
    "\n---\n[Session briefing — where are we]\n" +
    "Recent commits:\n" +
    (log || "(no git history)") +
    "\n\nUncommitted changes:\n" +
    (st || "none") +
    "\n---\n";

  // UserPromptSubmit: stdout on exit 0 is added to the model's context.
  process.stdout.write(text);
}

main();
