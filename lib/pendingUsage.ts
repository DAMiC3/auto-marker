// Durable dead-letter buffer for usage that couldn't be written to Supabase
// (Problem 8 / P1-6). Lives in Cloudflare D1 — NOT Supabase, because Supabase is
// the thing that's down when recordUsage fails. When a later marking request
// succeeds, drainPendingUsage() replays the parked events into add_usage and
// deletes them, so the counter self-heals with no manual step.
//
// Local `next dev` has no D1 binding → we fall back to an in-process array so
// dev doesn't crash. That fallback is per-process and NOT durable; production
// must have the USAGE_DLQ binding (see wrangler.jsonc + db/d1/pending_usage.sql).

import { createServiceClient } from "@/lib/supabase/service";

export interface PendingUsageEvent {
  userId: string;
  costZar: number;
  papers: number;
  tier: string;
  ts: number; // epoch ms when it was parked
}

// Minimal structural type for the D1 methods we use (avoids a hard dependency
// on @cloudflare/workers-types being installed).
interface D1PreparedLike {
  bind(...args: unknown[]): D1PreparedLike;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
}
interface D1Like {
  prepare(query: string): D1PreparedLike;
}

// Dev-only fallback store (single process; lost on restart).
const memoryQueue: PendingUsageEvent[] = [];
let warnedNoD1 = false;

async function getDlqDb(): Promise<D1Like | null> {
  try {
    const mod = await import("@opennextjs/cloudflare");
    const { env } = mod.getCloudflareContext();
    const db = (env as Record<string, unknown>).USAGE_DLQ;
    return (db as D1Like) ?? null;
  } catch {
    return null; // no Cloudflare context (e.g. plain `next dev`)
  }
}

async function ensureTable(db: D1Like): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS pending_usage (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id TEXT NOT NULL,
         cost_zar REAL NOT NULL,
         papers INTEGER NOT NULL,
         tier TEXT NOT NULL,
         ts INTEGER NOT NULL
       )`,
    )
    .run();
}

// Park a usage event that failed to record in Supabase.
export async function enqueuePendingUsage(event: PendingUsageEvent): Promise<void> {
  const db = await getDlqDb();
  if (!db) {
    if (!warnedNoD1) {
      console.error(
        "pendingUsage: no USAGE_DLQ (D1) binding — using in-memory fallback (NOT durable). Fine for local dev; production must bind D1.",
      );
      warnedNoD1 = true;
    }
    memoryQueue.push(event);
    return;
  }
  try {
    await ensureTable(db);
    await db
      .prepare(
        `INSERT INTO pending_usage (user_id, cost_zar, papers, tier, ts) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(event.userId, event.costZar, event.papers, event.tier, event.ts)
      .run();
  } catch (e) {
    // Last resort: keep it in memory so we don't lose it this process lifetime.
    console.error("pendingUsage: D1 insert failed, falling back to memory:", e);
    memoryQueue.push(event);
  }
}

interface PendingRow {
  id: number;
  user_id: string;
  cost_zar: number;
  papers: number;
  tier: string;
  ts: number;
}

// Replay every parked event into add_usage; delete each on success. Safe to call
// opportunistically after a successful write — a no-op when the buffer is empty.
// Returns how many events were successfully flushed.
export async function drainPendingUsage(): Promise<number> {
  const db = await getDlqDb();
  const svc = createServiceClient();
  let flushed = 0;

  if (!db) {
    // Dev / no-binding path: drain the in-memory queue.
    if (memoryQueue.length === 0) return 0;
    const pending = memoryQueue.splice(0, memoryQueue.length);
    for (const ev of pending) {
      const { error } = await svc.rpc("add_usage", {
        p_user: ev.userId, p_cost: ev.costZar, p_papers: ev.papers, p_tier: ev.tier, p_file: null,
      });
      if (error) {
        memoryQueue.push(ev); // still down — re-park for the next attempt
      } else {
        flushed++;
      }
    }
    return flushed;
  }

  try {
    await ensureTable(db);
    const { results } = await db
      .prepare(`SELECT id, user_id, cost_zar, papers, tier, ts FROM pending_usage ORDER BY id LIMIT 100`)
      .all<PendingRow>();
    if (!results || results.length === 0) return 0;

    for (const row of results) {
      const { error } = await svc.rpc("add_usage", {
        p_user: row.user_id, p_cost: row.cost_zar, p_papers: row.papers, p_tier: row.tier, p_file: null,
      });
      if (error) break; // Supabase still unhealthy — stop; leave the rest parked
      await db.prepare(`DELETE FROM pending_usage WHERE id = ?`).bind(row.id).run();
      flushed++;
    }
  } catch (e) {
    console.error("pendingUsage: drain failed:", e);
  }
  return flushed;
}
