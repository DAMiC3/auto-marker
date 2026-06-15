# Category 4 — Error Handling (incl. Observability)

**Status:** ✅ Fully documented (extra-detailed) · **Last verified against code:** 2026-06-12
**Owner:** Michael Bernard

How the system behaves when things go wrong, and how we **see** that they went wrong. **Observability folds in here** — logging, exception tracking, dashboards, alerting. You can't handle what you can't see, so the two belong together.

This is a *cross-cutting* category: it doesn't own a feature, it owns the failure behaviour of every other category. The honest summary up front: **error handling is decent at the boundaries (clear status codes, retries on usage writes, isolated per-paper batch failures) but observability is essentially absent (console logs only, no alerting, no dashboard).**

---

## 1. Philosophy (as implemented)

Three patterns recur across the codebase:

1. **Fail loud at the API boundary** — routes return specific HTTP codes (400/402/503) and a generic 500 fallback, never a silent success. The strongest example: a missing API key returns **503**, never a fake/mock mark (a deliberate "never stamp marks we didn't earn" rule).
2. **Fail open on infra, fail closed on logic** — when *metering infrastructure* hiccups, the instant route keeps marking (availability > strict enforcement); when the *allowance logic* says no, it blocks. (This is inconsistent between routes — see §7.)
3. **Swallow-and-continue on the client** — non-critical client operations (`listMemos`, `loadSavedRoot`, `AllowanceBar.refresh`) use `.catch(() => {})` so a single failure never white-screens the app. Good for resilience, bad for visibility.

---

## 2. HTTP status taxonomy (server routes)

| Code | Meaning | Where it's returned |
|------|---------|---------------------|
| **400** | Bad input | no pages (`/api/mark`), no papers (`/api/mark/batch` POST), missing batch `id` or missing key (`batch` GET) |
| **402** | `allowance_exhausted` | cap hit / period expired / batch pre-flight overspend (both routes) |
| **500** | Generic server failure | outer `catch` in every route ("Marking failed", "Batch submission failed", "Batch retrieval failed") |
| **503** | AI not configured | `ANTHROPIC_API_KEY` missing (both **POST** routes) |
| **redirect** | Auth gate | middleware → `/login`; auth callback failure → `/login?error=auth` |

> ⚠️ **Inconsistency:** a missing key is **503** in the POST routes but **400** in the batch **GET** route. Same condition, different code. (§7)

---

## 3. Error handling, layer by layer

### 3.1 Instant route — `app/api/mark/route.ts`
- **Outer `try/catch`** → 500 + `console.error("Mark route error:", err)`.
- **Input guard** → 400 if no pages.
- **Key guard** → 503 if no `ANTHROPIC_API_KEY` (explicit "No marks were applied").
- **Metering pre-check** now delegates to the shared **fail-CLOSED** gate `checkAllowance()` (Cat 1 §6.3, fixed P1-2/P4-2 2026-06-15). On any verification error (auth lookup or profile read) it returns `verification_failed` 503 and **blocks** marking — the old inner `try/catch … continuing` that yielded *free* marking is gone. Genuine backend failures also page ops (`notifyOps`).
- **Allowance block** → 402 (`allowance_exhausted`) / 401 (`not_authenticated`) / 503 (`verification_failed`), all from `checkAllowance()`.
- **Usage recording** → `recordUsage()` (retry-backed, §5.2); its failure does **not** fail the request (the mark already happened).

### 3.2 Batch route — `app/api/mark/batch/route.ts`
- **POST outer `try/catch`** → 500 "Batch submission failed."; **GET outer `try/catch`** → 500 "Batch retrieval failed."
- **`getUserId()`** (still used by the GET/recording path) has its own `try/catch` returning `null` on failure (so an auth hiccup ≠ crash).
- **POST pre-check now uses the shared fail-CLOSED gate** `checkAllowance()` (same as instant) — a verification error returns `verification_failed` 503 and blocks. The old instant/batch asymmetry (P4-2) is resolved.
- **Pre-flight overspend** → 402 with `{ detail, affordable }`.
- **GET per-paper isolation:** each result is `succeeded` → `parseMarkResponse` in a `try/catch` (→ `{error:"Could not parse marking result."}`) or non-succeeded → `{error:"Marking failed for this paper."}`. **One bad paper never kills the batch.** This is the most robust error handling in the app.

### 3.3 Marking libs
- **`lib/markingPrompt.ts` → `parseMarkResponse`** throws `"No JSON object found…"` when there are no braces; `JSON.parse` can also throw. In **batch** this is caught per-paper; in **instant** it bubbles to 500 (the whole paper fails).
- **`lib/cost.ts`** degrades gracefully: unknown model → Sonnet rates; every usage field `?? 0`. Cannot throw.
- **`lib/usage.ts`** → `isBlocked(null) = true` (fail closed); `recordUsage` retries (§5.2).
- **`lib/markPaper.ts` → `markInstant`** turns a non-OK response into `throw new Error(serverError ?? "Marking failed")`, surfacing the server's message to the UI. `preparePaper` has **no error handling** — pdf.js / canvas errors (corrupt PDF, OOM) propagate to the caller.

### 3.4 Client orchestration — `app/page.tsx`
- **`handleMark`** wraps the whole run: maps `allowance_exhausted` → friendly copy, otherwise shows the raw message; re-reads the From folder in the `catch`; `finally` clears busy/progress and fires `allowance-refresh`.
- **`pollBatch`** throws on a non-OK poll and throws `"Batch is taking longer than expected…"` after **240 attempts × 5 s ≈ 20 min**.
- **`handleConnect`** swallows the picker `AbortError` (user cancel) and surfaces other errors.
- **`handleAddMemo`** → `try/catch` → `setError`. **`listMemos` / `loadSavedRoot`** → silent `.catch(() => {})`.

### 3.5 Auth & middleware
- **`middleware.ts`** — if Supabase env is missing it **doesn't gate** (fail open). Otherwise it calls `supabase.auth.getUser()` and redirects. **There is no `try/catch` around `getUser()`** → a Supabase *auth* outage could throw and break page loads broadly. (§7 — biggest resilience gap.)
- **`app/auth/callback/route.ts`** — exchanges the code; on success redirects to `next`, on failure redirects to `/login?error=auth`. ⚠️ **`?error=auth` is never displayed** — the login page doesn't read it. Silent failure (§7).
- **`lib/supabase/server.ts`** — `setAll` is `try/catch`-guarded (Server Component cookie writes are safely ignored).

### 3.6 Storage (browser)
- **`loadSettings`** (`SettingsPanel.tsx`) → `try/catch` → returns `DEFAULT_SETTINGS` (survives private mode / corrupt blob).
- **IndexedDB** (`memoArchive.ts`, `fileSystem.ts`) — promises reject on error; callers mostly `.catch(() => {})`. Permission-revoked file writes throw up into `handleMark`'s catch.

---

## 4. Failure-mode catalogue

The meaty part. **Trigger → current behaviour → gap → planned.**

| Trigger | Current behaviour | Gap | Planned (expansion plan) |
|---------|-------------------|-----|--------------------------|
| **Anthropic 429 (rate limit)** | Handled only by the **Anthropic SDK's built-in retry** (default ~2 retries on 429/5xx with backoff). Routes do **not** set `maxRetries` or add custom backoff. If retries exhaust → outer catch → 500 generic. | No explicit backoff, no queue, no "high demand, queued" UX. | Phase 4: explicit exponential backoff + Cloudflare Queues throttling |
| **Anthropic 5xx / outage** | SDK retries then throws → 500 "Marking failed. Check server logs." | No outage detection, no auto-requeue, user just sees a generic error | Phase 4: health-check cron + auto-retry |
| **Anthropic / Worker timeout** | `maxDuration = 60` (Cloudflare wall) hits before the SDK's long timeout on slow calls → 500 | Large/slow papers can't be retried gracefully | Phase 3: move heavy work off the request path (Queues) |
| **Malformed model JSON** | Batch: isolated per-paper `{error}`. Instant: bubbles → 500 (whole paper) | Instant has no per-paper salvage | — |
| **Corrupt / password-protected PDF** | `preparePaper` (pdf.js) throws → `handleMark` catch → raw error banner. **Instant: aborts the loop, leaving later papers unmarked.** Batch: aborts the prepare loop. | No pre-validation, no skip-and-continue, poor message | Phase 4: validate before queueing, skip bad files with a clear per-file error |
| **Browser OOM on large PDF** | Canvas render throws → same error path | No chunking; whole run fails | Phase 3: page-at-a-time processing |
| **Supabase down (pre-check)** | ✅ Both routes **fail CLOSED** via `checkAllowance()` → `verification_failed` 503, nothing marked, ops paged (P1-2, 2026-06-15) | Consistent; availability traded for no free marking | Resolved |
| **Supabase down (recordUsage)** | 3 retries → park in D1 dead-letter buffer → `notifyOps` → returns false; auto-drains on recovery (Problem 8) | Mark delivered but usage **not lost** — replayed later | Resolved |
| **Supabase auth down (middleware)** | No `try/catch` → may throw → broad page-load failures | No graceful degradation here | §7 — wrap in try/catch |
| **Mid-batch allowance run-out** | Pre-flight estimate blocks an over-budget batch *before* submit; but a batch already in flight isn't stopped per-paper | No hard mid-run stop (estimate only) | Phase 4: partial-completion enforcement |
| **Batch poll > 20 min** | `pollBatch` throws "taking longer than expected — may still finish" | Result may be lost from the client's view | Phase 1/2: server-side batch tracking |
| **User closes tab mid-batch** | Poll loop dies; Anthropic batch still completes server-side but is **never retrieved/stamped** → work lost | No resumable jobs | Phase 1/2: server-side batch state + email on completion |
| **File permission revoked** | `writeFile`/`moveFile` throw → `handleMark` catch → banner | — | — |
| **localStorage/IndexedDB unavailable** | `loadSettings` → defaults; storage ops → silent catches | Memos/folder silently won't persist | — |

---

## 5. Retry & resilience mechanisms (what exists)

1. **Anthropic SDK default retries** — the only thing standing between a transient 429/5xx and a user-facing 500. *Not configured explicitly* in the routes; relies on SDK defaults. **If you want guaranteed behaviour, set `maxRetries` explicitly** when constructing `new Anthropic(...)`.
2. **`recordUsage()` retries** (`lib/usage.ts`) — 3 attempts, `250ms × attempt` backoff, per-attempt `try/catch`, checks the supabase-js `error` return (which the old code ignored), final `CRITICAL` log. Returns a boolean the callers currently **ignore**.
3. **Batch polling** — bounded retry loop (240 × 5 s) with a clear terminal error.
4. **Per-paper batch isolation** — one paper's failure is captured, not propagated.
5. **Config guards** as graceful degradation — see §6.

---

## 6. Graceful degradation (configuration guards)

The app is built to **run with pieces missing** rather than crash:

| Guard | Effect when env is absent |
|-------|---------------------------|
| `isServiceConfigured()` (`service.ts`) | No metering — marking proceeds unmetered (local dev) |
| `isSupabaseConfigured()` (`server.ts`/`client.ts`) | No auth gating; login shows "Sign-in isn't configured yet" |
| `middleware.ts` `!url \|\| !anonKey` | Skips the auth gate entirely |
| `ANTHROPIC_API_KEY` missing | 503 in routes (no fake marks) |

This is why local dev works without secrets — but it also means a **production env misconfiguration silently disables enforcement** rather than failing visibly. Worth a deploy-time assertion (see Category 6).

---

## 7. Known inconsistencies & bugs (error-handling specific)

1. ~~**Pre-check asymmetry**~~ — ✅ **RESOLVED (P1-2, 2026-06-15).** Both routes now share the fail-CLOSED `checkAllowance()` gate (Cat 1 §6.3): any verification error blocks marking (`verification_failed` 503) and pages ops; the old instant-route fail-open path is gone.
2. **Status-code mismatch** — missing key is 503 (POST) vs 400 (batch GET).
3. **Silent auth-callback failure** — `/login?error=auth` is set but never rendered; a failed email-confirmation looks like a no-op to the user.
4. **Middleware has no `try/catch`** around `getUser()` — a Supabase auth outage isn't degraded gracefully like the *config* guard is; it can break page loads. **Highest-value hardening target.**
5. **`recordUsage` boolean is ignored** — the only signal of unrecorded (free) usage is a console `CRITICAL` line with no automated destination.
6. **Instant-mode loop abort** — a single bad paper aborts the remaining papers (batch handles this correctly; instant does not).

---

## 8. Observability — current vs planned

### 8.1 Current state (thin)
- **Logging:** `console.error` / `console.log` only, scattered across routes and `recordUsage`. **Cloudflare Workers observability is enabled** (`observability.enabled: true` in `wrangler.jsonc` — Cat 6 §6), so logs surface in the dashboard live tail **and** are retained there. But they are **not externally aggregated, searchable across time, or alerted** — no Sentry, no Logpush sink, no thresholds.
- **The closest thing to an alert** is `recordUsage`'s `CRITICAL: usage NOT recorded…` line — but nothing watches for it.
- **No** exception tracking (Sentry), **no** Logpush, **no** uptime/health monitoring, **no** admin dashboard, **no** metrics (error rate, latency, active users, daily spend).
- **Consequence:** today you find out about failures from a customer, not a dashboard.

### 8.2 Planned (expansion plan Phases 2 & 4)
- **Sentry** (free tier) for exception tracking in the Next.js app.
- **Cloudflare Logpush** → a durable sink (Baselime/Axiom/dashboard) for searchable Worker logs.
- **Admin error dashboard** — a protected Next.js page querying Supabase: failed jobs (24h), current Anthropic error rate, active users, usage today. (Cheapest first step; needs the `batch_jobs` table from the expansion plan.)
- **Anthropic health-check cron** — ping every ~5 min, auto-retry failed jobs when the service recovers.
- **Alerting** — route `CRITICAL` usage-recording failures and dead-letter jobs to email (`bernardmanne3@gmail.com`) / Resend.

---

## 9. Invariants — do not break these

1. **Never return a successful mark you didn't make.** Missing key → 503, never a mock (the `mockResult` function stays dead — Cat 2 §4).
2. **A usage-write failure must be loud.** Keep the `recordUsage` retries + `CRITICAL` log; don't revert to silent `await rpc(...)`.
3. **One bad paper must not fail a whole batch.** Preserve the per-paper `try/catch` in the batch GET.
4. **Decide and document the pre-check policy** (open vs closed) and apply it *consistently* across both routes.
5. **Client resilience swallows are fine for non-critical reads only** — never swallow a write that affects billing or data integrity.

---

## Problems / To-Fix Backlog

> Severity: 🔴 fix before real paying customers · 🟠 important · 🟡 minor/polish · 🔵 not-built/roadmap.

| ID | Sev | Problem | Fix direction |
|----|-----|---------|---------------|
| **P4-1** | 🔴 | **Middleware has no `try/catch`** around `getUser()` → a Supabase *auth* outage can throw and break page loads broadly. (= P7-5) | Wrap in try/catch; on failure, fail to `/login` or a maintenance state, not a crash. |
| ~~**P4-2**~~ | 🟢 | ✅ **FIXED (2026-06-15).** Pre-check policy asymmetry — both routes now share the fail-CLOSED `checkAllowance()` gate (Cat 1 §6.3); verification errors block marking + page ops. (= P1-2) | Done. |
| **P4-3** | 🟠 | **`recordUsage` boolean ignored** — the only signal of unrecorded (free) usage is a `CRITICAL` console line nothing watches. | Route CRITICAL to email/alerting. |
| **P4-4** | 🟡 | **Status-code mismatch** — missing key = 503 (POST) vs 400 (batch GET). | Standardise on 503. |
| **P4-5** | 🟡 | **Silent `?error=auth`** — auth callback sets it, login page never displays it. (= P7-6) | Read + render the param on the login page. |
| **P4-6** | 🟡 | **No correlation id** on 500s → can't trace which user/paper failed. | Add a request id to logs + response. |
| **P4-7** | 🟡 | **No timeout on Supabase calls** → a hung query rides to the 60 s Worker wall. | Add explicit client-side timeouts. |
| **P4-8** | 🟠 | **Observability gap** — CF dashboard logs only; no Sentry, no Logpush sink, no alerting, no admin dashboard. | Phase 2/4: Sentry + Logpush + protected admin page. |

---

## 10. Key files (quick reference)

| File | Error-handling role |
|------|---------------------|
| `app/api/mark/route.ts` | Instant: 400/402/401/503/500; **fail-closed** `checkAllowance()` gate; retry-backed recording |
| `app/api/mark/batch/route.ts` | Batch: per-paper isolation, pre-flight 402, **fail-closed** `checkAllowance()` gate (POST) |
| `lib/usage.ts` | `checkAllowance` (fail-closed gate + ops page), `isBlocked` (fail-closed), `recordUsage` (retries → D1 dead-letter + ops page) |
| `lib/markingPrompt.ts` | `parseMarkResponse` throws on no-JSON |
| `lib/markPaper.ts` | `markInstant` surfaces server errors; `preparePaper` unguarded |
| `app/page.tsx` | `handleMark` catch + friendly mapping; bounded `pollBatch` |
| `middleware.ts` | Auth gate; ⚠️ no try/catch around `getUser` |
| `app/auth/callback/route.ts` | Code exchange; ⚠️ silent `?error=auth` |
| `lib/supabase/{server,client,service}.ts` | Config guards = graceful degradation |

## 11. Cross-references
- The allowance pre-check / `recordUsage` semantics → **Category 1** (§6, §7)
- PDF/marking failure points (corrupt, OOM, parse) → **Category 2** (§8)
- Error/success banner UI + notification delivery → **Category 3** (§3, §8)
- Anthropic SDK retry behaviour, model errors → **Category 5**
- Deploy-time env assertions, Worker limits, Logpush wiring → **Category 6**
- Middleware/auth outage handling → **Category 7**
- Failure modes at scale & the monitoring roadmap → `../expansion-plan.md` Phases 3–4
