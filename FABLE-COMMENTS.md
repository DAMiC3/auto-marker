# Fable Comments — full app evaluation

> Written by Claude Fable 5 on 2026-07-10. **Read-only review — nothing was changed.**
> Each section is appended as the review progresses, so this file is safe against context loss.
> Verdicts: 🔴 would change (bug/risk), 🟡 would improve (debt/smell), 🟢 note/observation (fine as-is, worth knowing).

## Scope

Everything in the repo: config, marking engine, API routes, auth, billing/allowance,
UI components, DB migrations, PWA/service worker, scripts, docs.

## Status

- [x] 1. Config & tooling (package.json, wrangler, next.config, open-next, tsconfig, eslint)
- [x] 2. Marking engine (lib/markPaper.ts, lib/markingPrompt.ts, markShapes, memoArchive)
- [x] 3. API routes (mark, batch, account, trial, report-error)
- [x] 4. Auth & middleware (middleware.ts, login, callback, supabase clients)
- [x] 5. Billing & allowance (allowance, usage, cost, pendingUsage, plans page)
- [x] 6. Main UI (app/page.tsx, components/)
- [x] 7. DB (migrations, RLS, D1 DLQ)
- [x] 8. AI usage & pricing constants (folded PWA notes into §6)
- [x] 9. Scripts & repo hygiene
- [x] 10. Docs
- [x] Summary & priorities

---

## 1. Config & tooling

### 🔴 Stray WildLodge files in the AutoMark repo
`components/AreaServiceTiles.tsx` and `components/SpeciesTiles.tsx` are **empty (0-byte), untracked** files sitting in this repo. The names match the WildLodge hunting-lodge POC (a separate project). They do nothing today, but the moment someone imports them the build breaks, and they pollute `git status`. **Would change: delete them from this repo** (recreate in the WildLodge folder if needed).

### 🟢 ~~Uncommitted `wrangler.jsonc` change~~ — resolved mid-review
The `+ "workers_dev": true` diff that was pending at review start was committed during this session (by a concurrent session/user) as `ea185a6` "Explicitly enable workers_dev route". No action needed; noting it so the review's snapshot makes sense.

### 🔴 Zero automated tests
`package.json` has no test framework at all — no vitest/jest, no Playwright, no `test` script. This is a **revenue product that stamps marks onto student papers**; the highest-value, easiest wins are pure functions that are begging for unit tests:
- `parseMarkResponse()` (malformed model JSON, fenced JSON, missing keys)
- `computeCostZAR()` / allowance math (billing correctness!)
- `hasFenceCollision()`, `strictnessGuidance()` band edges
- `wrapText()`, `hexToRgb()`, y-clamping in `stampPaper()`
Would change: add vitest + a `test` script, cover the money-touching and parsing code first. No UI tests needed to start.

### 🟡 No `typecheck` script
Only `lint` exists. The repo's own bugfix-mode hook enforces `tsc` — add `"typecheck": "tsc --noEmit"` so humans and CI can run the same gate.

### 🟡 `next.config.ts` is empty — no security headers
No CSP, no `X-Frame-Options`/`frame-ancestors`, no HSTS, no `Referrer-Policy`. An app that handles student work + accounts should at minimum set frame-ancestors (clickjacking on the login page) and a basic CSP. Headers can be added via `headers()` in next.config or in middleware.

### 🟢 Committed Supabase anon key in `wrangler.jsonc`
Fine as-is — the anon key is designed to be public and RLS is the boundary (migrations show RLS hardening). Noting it so nobody "fixes" it into a secret, and so nobody mistakes it for a leak.

### 🟢 Dependency hygiene is good
Lean dependency list, Next pinned exactly at 15.5.18 to match the OpenNext constraint, matching `eslint-config-next`. `netlify.toml` is dead config now that Netlify is paused — deletion candidate, keep-cost is near zero.

### 🟡 `AutoMark-Offer.html` / `AutoMark-Offer.pdf` in repo root
Marketing collateral committed at the top level of the app repo. Harmless, but it belongs in `docs/` or the landing-site repo. Root-level clutter makes the repo look less tended than it is.

## 2. Marking engine (`lib/markPaper.ts`, `lib/markingPrompt.ts`)

### 🔴 Last-page "Marker's notes" block can overwrite student content
`stampPaper()` collects every annotation comment plus the summary and draws the block starting at `y = 28 + (block.length - 1) * 12` on the **existing** last page ([markPaper.ts:252](lib/markPaper.ts:252)). There is no bound: a heavily-commented paper (say 35 notes → ~45 wrapped lines) starts drawing at y≈556pt — i.e. from the **middle of the page downward, straight over the student's answers**. Would change: measure the block height and, when it doesn't fit the whitespace at the bottom, append a fresh "Marker's notes" page via `pdfDoc.addPage()` instead of overprinting.

### 🔴 `total` / `available` are trusted from the model, not reconciled with the annotations
P5-2 fixed `percentage` by recomputing it, but `total` and `available` are still whatever the model says. If the model's per-question `"m": "n/m"` values sum to 12/20 but it reports `total: 15`, the paper is stamped "Total: 15/20" **contradicting the visible per-question marks** — the worst kind of error for a marking product because a student/lecturer can see it. Would change: parse the `m` fields, sum awarded/available, and either use the sums as authoritative or flag a mismatch for review.

### 🟡 Marking output relies on prose-JSON parsing instead of forced tool-use
`parseMarkResponse()` regex-hunts a JSON blob out of free text (fence match, first-`{`-to-last-`}` slice). It's tolerant, but the failure mode is a whole paper erroring after tokens are spent. Anthropic supports forcing a tool call with an input schema (`tool_choice: {type:"tool"}`), which guarantees parseable structured output and would delete this whole fragile layer. Also: numeric fields aren't validated (a string `total` would flow into arithmetic as `NaN`).

### 🟡 16k `max_tokens` non-streaming on a Worker
A worst-case Opus response of ~16k output tokens takes minutes to generate; the SDK's default 10-minute timeout and the user staring at a spinner both loom. Works today because real papers are far smaller, but streaming (`client.messages.stream`) would remove the cliff entirely and enable progress UI later.

### 🟡 Model pins are a generation behind (deliberate, but worth a scheduled re-check)
`MODELS = { standard: "claude-sonnet-4-6", high: "claude-opus-4-7" }`. Opus 4.8 and Sonnet 5 exist now (mid-2026). ADR-001 pins these on purpose — not suggesting a blind bump — but marking accuracy *is* the product, so an eval-pack comparison (the 4 test PDFs + memo already exist via `scripts/gen-testpack.mjs`) against the newer models is cheap and could improve accuracy-per-rand. Would add a small "re-evaluate models" recurring task to the docs.

### 🔴 Empty/unreadable memo is never guarded — and the prompt contradicts the "No memo" feature
Verified against the UI (§6): there is **no guard anywhere**.
1. `extractMemoText()` returns `""` for scanned/image-only PDF memos; `handleAddMemo()` swallows extraction errors with `.catch(() => "")` and saves the memo anyway. A lecturer who uploads a **scanned memo** sees it listed as a normal memo, marks a whole batch against it, and every paper is marked **with no answer key** — the most dangerous silent failure in the product. Would change: at add time, warn when extracted text is empty/near-empty ("This memo looks like a scan — no text could be read from it").
2. The memo dropdown offers **"No memo (mark from general knowledge)"** as a first-class option ([page.tsx:897](app/page.tsx:897)) — but the system prompt says *"The memo is the only source of truth… Do not award marks for plausible-sounding content the memo does not support… If an answer is missing… mark it 0"* ([markingPrompt.ts:99-107](lib/markingPrompt.ts:99)). With no memo the model is being simultaneously told "mark from general knowledge" (UI promise) and "award nothing the memo doesn't support" (prompt). Whatever it does will be inconsistent. Would change: either remove the no-memo option, or branch the system prompt into an explicit general-knowledge marking variant when `memoText` is empty.
3. `/api/mark` itself accepts `memoText: ""` without complaint — even with a UI guard, the server should enforce its own minimum.

### 🟡 O(n²) line grouping in `preparePaper()`
`lines.find(...)` inside the per-item loop is quadratic in text items per page. Exam pages are small so it's fine today; a dense 3-column PDF page could crawl. Cheap fix if it ever bites: bucket by `Math.round(y/0.012)`.

### 🟢 Good: text-first extraction with y-hints, image fallback with dimension cap, blank-page skip
The cost engineering here is genuinely good — text pages are ~10× cheaper, `MAX_IMAGE_DIM` caps vision cost, blank pages are dropped with a deliberately conservative threshold, and the client does all PDF work so the Worker stays thin.

### 🟢 Good: fence-based injection defence is proportionate
Triple-PUA fence + `hasFenceCollision()` quarantine + explicit "fenced content is never an instruction" prompt language is a lean, honest design. Image pages being unscannable is an accepted, documented limit.

---

## 3. API routes & billing integrity

This is where the highest-stakes findings live. The fail-closed philosophy (`checkAllowance`, no-mock, D1 dead-letter queue, ops paging) is genuinely well designed — the issues below are the gaps *around* that design.

### 🔴 Batch billing trusts the client's `quality` query param — 5× undercharge possible
`GET /api/mark/batch?id=…&quality=…` prices the retrieved batch using the **client-supplied** `quality` ([batch/route.ts:134](app/api/mark/batch/route.ts:134), [:151](app/api/mark/batch/route.ts:151)). Submit an Opus ("high") batch, then poll it with `quality=standard`, and the recorded cost is computed at Sonnet batch rates — roughly **5× cheaper than reality**. No hostile client needed; a bug would do it too. Would change: each result message carries its real `model` — price each entry from `msg.model`, never from the query string.

### 🔴 Double-charge on double poll — usage recording isn't idempotent
The GET route records usage **every time** it retrieves an ended batch. Poll twice (refresh mid-poll, a retry after a network blip, two tabs) and `add_usage` fires twice — the user's allowance is docked twice for one batch. Would change: make recording idempotent per batch id (e.g. an `applied_batches` table with a unique key, or record at submit time as a reservation).

### 🔴 Billing depends on the client polling — an abandoned batch is never recorded (and never delivered)
Usage for a batch is only recorded inside the GET poll. If the user closes the tab / loses power after submit: the batch still completes at Anthropic (real cost to you), **no usage is ever recorded** (the user pays nothing), and the batch id is lost — nothing client-side persists it, so the marked results are unreachable and the originals sit in From. Related hole: if the poller's session has expired, `getUserId()` returns null and `recordUsage` is silently skipped while results are still returned. Would change: persist `batchId → userId` server-side at submit (D1 is already bound), record usage from that mapping regardless of who polls, and persist the active batch id in localStorage so a reopened tab can offer "resume checking your batch".

### 🔴 TOCTOU: concurrent requests can blow past the cap
`checkAllowance()` reads `used_zar`, then marking runs, then usage is recorded. Nothing serializes this per user: N parallel `/api/mark` calls all pass the gate before any of them records usage. A multi-tab (or hostile) user on a nearly-spent plan can overspend by N × max-single-request cost. The chunk loop's C-invariants protect the batch path client-side, but the server has no per-user reservation or lock. Theoretical at current scale — but the margin model rests on the caps. Cheap fix shape: an atomic reserve-then-settle RPC, or a per-user in-flight lock.

### 🔴 Fail-open when the service key is missing in production
`checkAllowance()` returns `allowed: true` when `isServiceConfigured()` is false — correct for local dev, but if `SUPABASE_SERVICE_ROLE_KEY` were ever wiped or rotated-but-not-set on the Worker, **production marking becomes free and unmetered, silently**. Would change: only treat "no service key" as unmetered when an explicit escape hatch (e.g. `ALLOW_UNMETERED=1`) is also set; otherwise fail closed + notifyOps.

### 🟡 Instant route has no pre-flight cost estimate (batch does)
`/api/mark` checks only "is the user already blocked" — a user at 99% can still fire one arbitrarily large instant mark (bounded by context-window cost, roughly R11–R77 worst case). The batch route pre-flights with `estimateBatchCostZar`; the instant route could reuse the same estimator on its `pages` for symmetric, bounded overshoot.

### 🟡 No input validation / size caps on request bodies
Both mark routes accept unbounded `pages[]` (count and per-page string size) and unvalidated `strictness`/`markTypes`. Cost is bounded per request by the model context limit and gated by allowance, so this is mostly robustness — but a `MAX_PAGES_PER_PAPER` plus a light schema check would turn garbage into a clean 400 instead of a confusing model error.

### 🟡 `message.content[0]` assumed to be the text block
Both routes read `content[0]` and cast. If a model change ever returns a thinking block first (or multiple blocks), this silently reads the wrong block. Safer: `message.content.find(b => b.type === "text")`.

### 🟡 `maxDuration = 60` is a Vercel-ism
On Cloudflare Workers via OpenNext it does nothing. Harmless but misleading — a reader may believe there's a 60s guard where none exists.

### 🟡 Fire-and-forget `drainPendingUsage()` may never run on Workers
[usage.ts:199](lib/usage.ts:199) deliberately doesn't await the drain — but on Workers, un-awaited promises can be cancelled when the response returns. The DLQ still self-heals on a later awaited path, so nothing is lost, but the opportunistic flush is unreliable. Would change: `getCloudflareContext().ctx.waitUntil(drainPendingUsage())`.

### 🟡 `notifyOps` fetch has no timeout
It's awaited inside error paths and allowance-gate failures; a hanging webhook host stalls those requests. `withTimeout` already exists — wrap the fetch (~3s).

### 🟢 account/delete, account/export, trial/start, report-error are all well built
Self-identification from the session (never a body uuid), delete-cascade policy documented in the route, POPIA-conscious export (no Rand internals), server-side plan re-check before the trial grant, one-trial-per-email surfaced as 409. Two small notes: (a) the export CSV doesn't escape leading `=`/`+`/`@` (Excel formula injection — the only victim is the exporting user, so cosmetic); (b) report-error has no rate limit, so any signed-in user could spam your ntfy phone push — a per-user daily cap would do.

## 4. Auth & middleware

### 🔴 `/reset-password` is not a public route — its "invalid link" state is unreachable
`PUBLIC_PREFIXES = ["/login", "/auth"]` ([middleware.ts:10](middleware.ts:10)). The reset flow works when the callback establishes a session — and the branded email templates use the `token_hash` flow precisely so cross-device links work (good design, documented in [supabase/email-templates/README.md](supabase/email-templates/README.md)). But in the remaining failure case the page was built for — an **expired or already-used link**, where `verifyOtp` fails and no session exists — the user lands on `/reset-password` with no session and middleware bounces them to `/login` before they ever see the friendly "This reset link is invalid or has expired" card. Would change: add `/reset-password` to the public prefixes — the page already handles the no-session state gracefully.

### 🔴 Reset page lets users set a 6-char password while signup demands 8
P7-4 raised new passwords to ≥8 in login (`minLength={mode === "signup" ? 8 : 6}`), but [reset-password/page.tsx:104](app/reset-password/page.tsx:104) still has `minLength={6}` on a **new** password — the 8-char policy is bypassable via "reset". Both are client-side only; set Supabase's server-side minimum to 8 to make the policy real.

### 🟡 Middleware does a network auth call on every request
`supabase.auth.getUser()` hits the Supabase auth server on every page load *and* every API call (which then re-checks in `checkAllowance`) — two auth round-trips per mark request, plus latency on every navigation. Supabase supports local JWT verification (`getClaims` / asymmetric keys) for exactly this. Not urgent at current traffic; it's the biggest cheap latency win available.

### 🟡 `startsWith` public-prefix matching is loose
`/authanything` and `/loginfoo` would be treated as public. No current route collides, but exact-segment matching costs nothing.

### 🟡 Signup has no bot protection, and trials are backed by real Anthropic spend
Self-serve trial (R50 of model cost) + open signup + one-trial-per-*email* = trial farming bounded only by inbox creation (plus-addressing, throwaway domains). Low probability at your audience size, but real money per abuse. Cheap mitigations when it matters: Supabase Captcha (Turnstile) on signup, normalize `+`-suffixed emails in `trial_claims`, or manual trial approval.

### 🟢 Good: fail-closed middleware with timeout; honest sign-out (P7-9); cross-device confirm flow; enumeration-safe reset messaging; both PKCE and OTP link flavours handled in one callback.

## 5. Billing & allowance (shared libs)

### 🟢 The allowance architecture is the strongest part of the app
One `blockReason()` shared by the server gate and the UI notices; percentage-only display honouring ADR-002; conservative pre-flight estimates; a D1 dead-letter queue so a Supabase outage can't silently give away marking; documented safety invariants (C1–C16) for the chunk loop. Unusually disciplined for a solo project.

### 🔴 Duplicate model maps will drift
`QUALITY_TO_MODEL` in [usage.ts:39](lib/usage.ts:39) duplicates `MODELS` in [markingPrompt.ts:6](lib/markingPrompt.ts:6). Bump one and not the other and estimates silently price the wrong model. Import `MODELS` in usage.ts instead — one source of truth for something that directly prices money.

### 🟡 Rates fallback hides unknown models
`RATES[model] ?? RATES["claude-sonnet-4-6"]` — a renamed model id would be silently priced as Sonnet instead of failing loudly. For billing code, prefer a thrown error (caught → notifyOps).

### 🟡 Hardcoded `USD_TO_ZAR = 18.5`
If the rand weakens, every marked paper quietly erodes margin (users charged at 18.5 while you pay real dollars). Fine as a constant — but put a quarterly review reminder in the docs, or make it an env var so adjusting it doesn't need a deploy.

### 🟡 Text-page token estimate (600/page) is on the low side
A dense typed A4 page with y-prefixes runs ~800–1,000 tokens. The estimate only gates pre-flight (real usage is recorded from actual tokens), so the consequence is slightly-late chunk-stopping — nudge to ~800 for symmetry with the deliberately-high image estimate.

### 🟡 `SHARED_CACHE_READ = 1700` assumes a ~1,000-token memo
Memo text is unbounded — a 10-page memo blows the estimate instantly. The memo is in hand at estimate time; `memoText.length / 4` is an easy, much tighter bound.

## 6. Main UI (`app/page.tsx` + components)

### 🟢 The orchestration is impressively careful
Single-flight guard (`busy || chunkCtx`), destination-must-be-empty rule, prepared-payload memory budget with a human explanation, per-paper failure isolation (P2-3), non-PDFs never touched (P2-8), quarantine with the reason in the filename, results persisted across refresh. The failure-mode thinking is the app's best quality.

### 🔴 A closed tab mid-batch strands money and results
Instant mode is safe (originals removed only after the marked copy is written). Batch mode: after submit, everything hinges on this one tab staying alive — no batch id is persisted anywhere client-side (see §3 for the server half). Minimum fix: persist `{batchId, quality, customId→name}` next to `automark.lastResults` and offer "resume checking" on reload.

### 🔴 Mark types with the same shape silently collide
The model is told shapes like `"tick" (M = Full mark)`, and `stampPaper`'s `colorForShape()` takes the **first** mark type matching a shape ([markPaper.ts:198](lib/markPaper.ts:198)). Settings happily allows two mark types with the same shape — **the defaults ship that way** ("M" and "A" are both ticks). The second one's colour can never appear on paper, and the prompt's shape list contains "tick" twice with different meanings. Would change: enforce shape uniqueness in Settings (disable taken shapes in the picker), or key annotations by abbrev.

### 🟡 Default profile is the founder's own name
`DEFAULT_SETTINGS.profile = { name: "Michael Bernard", subject: "English" }` ([SettingsPanel.tsx:56](components/SettingsPanel.tsx:56)) — every new user's sidebar greets them as Michael Bernard until they edit Settings. Signup already collects `full_name`; use that (or empty + placeholder).

### 🟡 `pollBatch` reads `chunkCtx` after it's been cleared
`startChunkLoop` nulls `chunkCtx` up front, so the "Processing chunk…" label branch ([page.tsx:728](app/page.tsx:728)) can never be true during the loop — it always shows "Processing batch…". Pass an `isChunk` flag. Cosmetic.

### 🟡 20-minute poll ceiling, then a dead end
`pollBatch` gives up after ~20 min with "may still finish — try again shortly", but there's no way to try again (no persisted id; originals unmoved). Anthropic batches can legitimately run longer under load. Ties into the resume fix above.

### 🟡 Errors auto-dismiss after 15 s
A user who walks away during a long run returns to a silent screen — the error explaining why marking stopped has self-cleared. Results persist; errors don't. Keep fatal-run errors sticky until dismissed.

### 🟡 The chunk dialog lacks the a11y treatment SettingsPanel has
SettingsPanel has a real focus trap, Esc, `role="dialog"`, focus restore — genuinely good work. The over-limit modal ([page.tsx:1090](app/page.tsx:1090)) has none of it, and Sidebar's account menu is Esc-only with no arrow-key support. Reuse the SettingsPanel pattern.

### 🟡 One 1,140-line component holds all the money-guarding logic
`runInstant` / `runBatch` / `startChunkLoop` / `pollBatch` / `applyChunkResults` are untestable while embedded in `Home`. Extracting a `lib/markingRun.ts` (pure orchestration with injected callbacks) would make the C1–C16 invariants unit-testable — which matters, because they guard money.

### 🟡 Three components fetch the same profile row independently
AllowanceBar, PlanNotice, and TrialCta each do `auth.getUser()` + a `profiles` select on mount and again on every `allowance-refresh` — three identical queries per refresh. One shared hook/context would cut the chatter and keep them consistent.

### 🟡 TrialCta's success message self-destructs
`startTrial()` sets phase "started" then immediately dispatches `allowance-refresh`; the refresh flips `reason` away from `no_plan`, unmounting the card — including the 🎉 message the user was meant to read. Render the success card off `phase === "started"` alone.

### 🟡 Destination-empty check fails open
`listFiles(toFolder.handle).catch(() => [])` — if listing the destination throws (revoked permission), the safety check passes as "empty". Fail the run instead; the write would fail anyway, but with a worse message.

### 🟢 Small notes
- Login / reset / confirmed pages: consistent, friendly, on-brand. Good.
- Plans page: `waLink("chosen")` yields the literal WhatsApp text "activate the chosen plan" — reads oddly; use a generic message for the bottom button.
- Sidebar's "This app was created by a Christian." popover — clearly deliberate; noting it only so it isn't mistaken for placeholder. Keep/remove is a business choice, not a code issue.
- SubjectCombobox: no arrow-key navigation (mouse/Enter only). Minor a11y.
- `tsconfig` is `strict` ✅; adding `noUncheckedIndexedAccess` would have flagged the `content[0]` assumptions.
- PWA: network-first SW with versioned cache and a proper update prompt — textbook. The manual `CACHE = "automark-v2"` bump is easy to forget on deploy; a build-stamped cache name removes the human step.
- `globals.css` accent-variable system + the `beforeInteractive` accent script in layout: clean, no-FOUC theming done right.

---

## 7. Database (Supabase migrations, RLS, D1)

### 🟢 The DB layer is the most professionally-run part of the repo
RLS enabled on every table; `add_usage`/`set_plan` are SECURITY DEFINER with EXECUTE revoked from anon/authenticated and granted only to service_role; advisor findings tracked as numbered migrations with corrective follow-ups; accepted-by-design findings encoded as table comments (P6-7) so future audits don't re-litigate them; `auth.uid()` wrapped in initplan subselects (P6-5); duplicate revenue trigger found and removed with reasoning in the migration. This is textbook.

### 🟡 The one-trial-per-email guard has a concurrency hole (tiny impact)
[one_trial_per_email.sql:44-49](supabase/migrations/20260615141346_one_trial_per_email.sql): `if exists (...) raise; insert ... on conflict (email) do nothing;` — two concurrent claims can both pass the `exists` check, and the loser's insert is swallowed by `do nothing` instead of raising, so **both** calls grant the trial. In practice the two callers are the same user double-clicking (same email = same account), so the outcome is identical — but the guard is logically wrong. Fix is a deletion: drop the `on conflict do nothing` and let the unique violation raise (the route already maps it to 409).

### 🟡 `add_usage` silently no-ops on a missing profile
It inserts the usage event, then `update profiles ... where id = p_user` — if the profile row doesn't exist (shouldn't happen, but deletes are live now), the counter update matches zero rows with no error while the event still logs. A `get diagnostics`/`if not found then raise` would make the invariant loud. Similarly, no guard against negative `p_cost`.

### 🟡 Owner email hardcoded in the revenue trigger
`log_revenue_event()` skips rows for `'bernardmanne3@gmail.com'` — pragmatic, but if the owner account's email ever changes, your own test payments silently start counting as revenue. A `metadata`-driven exclusion (or just knowing this note exists) is enough.

### 🟡 Profile name lives in two places that never sync
`profiles.full_name` is set once from signup metadata and never updatable by the user (no UPDATE policy — deliberate); the Settings "Display name" lives only in localStorage. The POPIA export shows the signup name while the app shows the local name. Would change: either sync Settings profile → DB (needs an UPDATE policy scoped to non-billing columns) or drop the DB name from the export's implied authority.

### 🟢 Notes
- `set_plan` resetting `used_zar` on renewal (no carryover) matches ADR-002 — deliberate.
- Plan prices exist in three places (plans page UI, `plan_price()` SQL, ADR-002) — change-management note, not a bug.
- D1 `pending_usage` schema file + lazy `CREATE IF NOT EXISTS` belt-and-braces is good.

## 8. AI usage & pricing constants

### 🔴 Opus 4.7 is priced 3× too high in `cost.ts` — users get a third of the High-accuracy marking they paid for
[cost.ts:17](lib/cost.ts:17) charges `claude-opus-4-7` at **$15 in / $75 out** per MTok (with cache write $18.75, cache read $1.50; batch $7.50/$37.50). The actual Opus 4.7 price is **$5 in / $25 out** (cache write $6.25, cache read $0.50; batch $2.50/$12.50) — the $15/$75 figures are the old Opus 4.1-era prices. Sonnet 4.6 ($3/$15) **is correct**. Consequences today: every "High accuracy" mark burns ~3× the real cost off the user's allowance, so a Standard plan delivers ~R100 of real Opus marking where it should deliver ~R300 — margins are silently ~3× better than ADR-002 models, and users are silently getting 3× less. `estimateBatchCostZar`'s Opus path and [docs/cost-and-pricing-notes.md](docs/cost-and-pricing-notes.md) inherit the same error. Would change: verify against the live pricing page / Console once, then correct `RATES` + `BATCH_RATES` and re-run the cost-notes arithmetic. (This is also the strongest argument for the §1 unit-test point — a one-line pricing test against a published sheet would have caught it.)

### 🟡 Newer models are out — worth one eval run, not a blind bump
Current line-up (verified 2026-06): **Opus 4.8** at the same $5/$25 as 4.7, and **Sonnet 5** at $3/$15 with intro pricing $2/$10 through 2026-08-31. Since marking accuracy *is* the product and `scripts/gen-testpack.mjs` already generates a ground-truth pack, a one-afternoon eval of {sonnet-4-6 vs sonnet-5} and {opus-4-7 vs opus-4-8} could raise accuracy-per-rand with zero price increase. Respect the ADR-001 process; also note both mark routes read `content[0]` (§3) — fix that before any model bump, since newer models are likelier to emit thinking blocks.

### 🟡 16k `max_tokens` non-streaming sits exactly at the SDK guidance boundary
Anthropic's own guidance: non-streaming is fine up to ~16k output; above that, stream. `MAX_OUTPUT_TOKENS = 16000` is exactly at the line — fine today, but any bump (e.g. for longer papers, per the P2-4 truncation history) must come with a switch to `client.messages.stream()`.

### 🟢 Good API usage elsewhere
Batch API flow is textbook (submit → poll `processing_status` → iterate results keyed by `custom_id`, never by position). Prompt caching on system + memo is correctly placed (stable content first). `maxRetries: 4` with documented reasoning. The no-mock/fail-loud policy on missing keys is exactly right for a product that stamps marks.

## 9. Scripts & repo hygiene

- 🟡 **Two untracked Python scripts** — `scripts/build-links-docx.py` and `scripts/build-offer-pdf.py` (and their outputs `AutoMark-Offer.html`/`.pdf` in the repo root, which *are* tracked). Decide: commit the scripts (they're the source of the tracked outputs) or move the whole offer-collateral set to the landing-site repo. Current state — tracked outputs with untracked generators — is the worst combination.
- 🟡 **AGENTS.md references `scripts/debug-mark.mjs`; the actual file is `debug-mark.mts`.** One-character doc drift, but AGENTS.md is what every fresh agent session reads.
- 🟢 `gen-testpack.mjs` (ground-truth test pack), `gen-icons.mjs`, `extract-debug.mjs` — small, purposeful, documented at the top. Good.
- 🟢 `.claude/` setup (session-brief hook printing recent commits + dirty files on every prompt, launch.json, command library) is genuinely nice agent ergonomics.
- 🟡 `netlify.toml` — dead config from the paused Netlify deploy (also noted in §1). Delete when convenient.
- 🟢 This file (`FABLE-COMMENTS.md`) is itself untracked — decide whether to commit it as a review artifact or keep it local.

## 10. Docs

### 🟢 Documentation is far above solo-project standard
`HANDOVER.md` (full state + gotchas), 7 category docs, ADRs with status fields, a DB backup runbook, a prompt-injection design doc, and email-template docs that explain *why* `token_hash` beats `ConfirmationURL` (cross-device). The Windows Defender / `build:cf` gotcha being documented with observed failure modes has certainly saved hours. The "update a category's doc whenever you change its code" rule is the right discipline.

### 🟡 Drift spots found while reading
- AGENTS.md: "Category 1 is fully documented; the rest are scaffolds" — categories 2–7 are now 190–280 lines each, so the claim undersells them (or they grew without the README claim updating). Also the `debug-mark.mjs` → `.mts` slip (§9).
- `docs/cost-and-pricing-notes.md` inherits the Opus pricing error (§8) — re-run its arithmetic when fixing `cost.ts`.
- Email templates live in the dashboard and must be re-pasted by hand — documented and acceptable, but it's the one config surface with no drift detection at all. A note in the deploy checklist ("templates changed? re-paste") would close the loop.

---

## Summary & priorities

The app is in much better shape than most solo-founder products: fail-closed billing philosophy, disciplined migrations, real failure-mode thinking in the UI, and unusually good docs. The serious findings cluster in one theme: **the billing pipeline trusts things it shouldn't** (the client's `quality` param, the model's `total`, a poll that must happen, a price sheet that was never re-checked).

**Top 10, ranked by (impact × likelihood):**

1. 🔴 **Fix Opus 4.7 pricing (3× overcharge)** — [cost.ts](lib/cost.ts) `RATES`/`BATCH_RATES`. One-line-ish fix, directly changes what customers get for R3000. (§8)
2. 🔴 **Price batch results from `msg.model`, not the client's `quality` query param** — closes a 5× undercharge hole. (§3)
3. 🔴 **Make batch usage recording idempotent + server-attributed** — persist `batchId→userId` at submit (D1 already bound); fixes double-charge on double-poll, expired-session free marking, and abandoned-batch cost leaks in one design. (§3)
4. 🔴 **Guard the memo pipeline** — warn on empty extraction at add time; resolve the "No memo" option vs. "memo is the only source of truth" prompt contradiction; reject empty memos server-side. This is the finding most likely to produce *visibly wrong marks for a paying lecturer*. (§2)
5. 🔴 **Reconcile `total`/`available` with the annotation sums** before stamping — a stamped total that contradicts the visible ticks is the worst customer-facing failure a marking product can have. (§2)
6. 🔴 **Fix the last-page notes overflow** — append a page instead of overprinting student work. (§2)
7. 🔴 **Add `/reset-password` to public prefixes + raise its `minLength` to 8** — two-line auth fixes. (§4)
8. 🔴 **Fail closed when the service key is missing in production** (explicit unmetered flag), and dedupe `QUALITY_TO_MODEL` into `MODELS`. (§3, §5)
9. 🟡 **Persist active batch id client-side + offer resume** — stops a closed tab stranding results and money; pairs with #3. (§6)
10. 🟡 **Add vitest and test the money paths** — `cost.ts` rates against the published sheet, `parseMarkResponse`, `blockReason`, `estimateBatchCostZar`, chunk-loop invariants (after extracting them from page.tsx). Every 🔴 above would have been caught or prevented by this. (§1)

**Worth doing when touching those areas anyway:** instant-route pre-flight estimate (§3), `waitUntil` for the DLQ drain (§3), TOCTOU reservation (§3 — theoretical at current scale), founder-name default profile (§6), duplicate-shape mark types (§6), stray WildLodge files + repo hygiene (§1, §9), TrialCta success flash (§6), chunk-dialog a11y (§6), trial-farming mitigations when signups open up (§4).

**Explicitly fine as-is:** anon key in wrangler.jsonc, service-role-only tables with zero policies, percentage-only allowance display, manual EFT flow, the fence-based injection defence, the PWA/service-worker setup, and the deploy dance (documented, works).

---

## Status update — 2026-08-07 (trust-for-first-3-customers pass)

Went back through this review filtered to "what would make an early trusted customer stop trusting us." Fixed the output-correctness trust-killers; one item deliberately left open for the owner to verify first.

**Fixed this session (P8-x):**
- ✅ **§2 last-page notes overflow** — already resolved earlier: feedback now lays out on dedicated appended page(s) sized to the wrapped text ([markPaper.ts:234](lib/markPaper.ts:234)), never over the exam.
- ✅ **§2 total/available not reconciled (P8-1)** — `parseMarkResponse` now **sums the per-question `n/m` marks in code and stamps that**, ignoring the model's self-reported `total`/`available` whenever any annotation carried a parseable mark (falls back to the model's figures only when nothing was summable). The AI marks; the app adds up the total. `lib/markingPrompt.ts` (`sumAwardedMarks`).
- ✅ **§2 empty/scanned memo silent failure (P8-2)** — `handleAddMemo` now **refuses** a memo with <20 readable chars (image-only/scanned PDF) with a clear "save as a text-based PDF" message, instead of silently saving a blank answer key. `app/page.tsx`.
- ✅ **§6 founder-name default profile (P8-3)** — `DEFAULT_SETTINGS.profile.name` is now `""`; the Sidebar greeting falls back to the signup `full_name` (Supabase user metadata), then email local-part, then "Your account". No more "Michael Bernard" greeting new users. `components/SettingsPanel.tsx`, `components/Sidebar.tsx`.

**⏳ DEFERRED — still open, remember this (§8 #1): Opus "High accuracy" priced 3× too high.**
[cost.ts:17](lib/cost.ts:17) meters `claude-opus-4-7` at **$15 in / $75 out** per MTok. Fable's review says the real rate is **$5 / $25** — if correct, High-accuracy customers burn allowance 3× too fast and get ~⅓ the marking they paid for. **Intentionally NOT changed yet** — the owner wants to verify the live price against the Anthropic Console/pricing page before touching billing. When confirmed, fix `RATES` **and** `BATCH_RATES` in `lib/cost.ts` (Opus row only — Sonnet 4.6 $3/$15 is correct), then re-run the arithmetic in [docs/cost-and-pricing-notes.md](docs/cost-and-pricing-notes.md). A one-line unit test of `RATES` against the published sheet would lock this down (§1).
