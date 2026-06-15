-- Dead-letter buffer for usage events that failed to write to Supabase during an
-- outage (Problem 8 / P1-6). Lives in Cloudflare D1, independent of Supabase, so
-- it survives the very failure it exists to catch. Drained automatically by
-- drainPendingUsage() on the next successful add_usage.
--
-- Apply:
--   npx wrangler d1 execute automark-usage-dlq --remote --file=db/d1/pending_usage.sql
-- (lib/pendingUsage.ts also CREATEs IF NOT EXISTS lazily, so this is belt-and-braces.)

CREATE TABLE IF NOT EXISTS pending_usage (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  TEXT    NOT NULL,
  cost_zar REAL    NOT NULL,
  papers   INTEGER NOT NULL,
  tier     TEXT    NOT NULL,
  ts       INTEGER NOT NULL  -- epoch ms when parked
);
