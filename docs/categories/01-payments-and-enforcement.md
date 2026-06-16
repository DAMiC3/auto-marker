# Category 1 — Payments & Enforcement

**Status:** ✅ Fully documented · **Last verified against live code + DB:** 2026-06-12
**Owner:** Michael Bernard · **Supabase project:** `pdlkkfedovssaaecemkp`

This is the money layer. It answers three questions:
1. **What is a user allowed to do?** (plans, allowances, restrictions)
2. **How do we stop them when they run out?** (enforcement, cutoffs)
3. **How does money turn into access?** (the payment + activation flow)

Everything about metering, billing periods, allowance caps, usage tracking, and the gates in front of the marking API lives here. The actual marking work lives in Category 2; this category only governs *whether marking is permitted and what it costs*.

---

## 1. The model in one paragraph

A user has a **plan** that grants a **Rand allowance cap** (`allowance_cap_zar`) for a **billing period** (`period_start` → `period_end`). Every marking job estimates its real token cost in Rand (`lib/cost.ts`), records it (`add_usage` → `used_zar` increments + a row in `usage_events`), and is blocked once **either** the cap is hit (`used_zar >= allowance_cap_zar`) **or** the period expires (`period_end <= now`). Allowance is **shown to users as a percentage only** — never Rand, never tokens — so margins and model costs stay invisible and we can change pricing/models without touching the UI. Payment is **manual EFT + WhatsApp proof**, after which a plan is granted by running `set_plan(uuid, plan)` in SQL.

---

## 2. Data model

### 2.1 `profiles` — the customer table (one row per auth user)

Created automatically on signup by the `handle_new_user()` trigger (see §4.3).

| Column | Type | Default | Null? | Meaning |
|--------|------|---------|-------|---------|
| `id` | `uuid` PK | — | NO | FK to `auth.users(id)` |
| `full_name` | `text` | `''` | NO | Display name |
| `subject` | `text` | `''` | NO | Lecturer's default subject |
| `plan` | `text` | `'none'` | NO | `'none' \| 'trial' \| 'standard' \| 'pro'` |
| `allowance_cap_zar` | `numeric` | `0` | NO | Rand budget for the current period |
| `used_zar` | `numeric` | `0` | NO | Rand spent **this period** (resets on plan change) |
| `period_start` | `timestamptz` | `null` | YES | When the current period began |
| `period_end` | `timestamptz` | `null` | YES | Hard cutoff; `null` for `'none'` |
| `created_at` | `timestamptz` | `now()` | NO | Row creation |

**RLS:** users can `select` their own row only. All **writes** go through `SECURITY DEFINER` functions called with the **service-role key** (server-side only), which bypasses RLS. The client never writes to `profiles` directly.

**Critical distinction — period vs lifetime:**
- `used_zar` is a **per-period counter**. `set_plan` resets it to 0 on every plan change. It is *not* lifetime spend.
- **Lifetime usage** lives in `usage_events` (below) and is never reset. That is the durable audit trail.

### 2.2 `usage_events` — the audit log (append-only)

| Column | Type | Meaning |
|--------|------|---------|
| `user_id` | `uuid` | FK to the user |
| `papers` | `integer` | How many papers this event covered |
| `model_tier` | `text` | `'standard'` or `'high'` (the UI-facing quality, not the model id) |
| `cost_zar` | `numeric` | Rand cost of this event |
| `file_name` | `text` | Optional source file (currently always `null` from the routes) |
| `created_at` | `timestamptz` | When marking completed |

**RLS:** users select their own only. Inserted exclusively via `add_usage`.

---

## 3. Plans & restrictions

| Plan | Price/mo (ZAR) | `allowance_cap_zar` | Period | API cost cap → margin | Notes |
|------|----------------|---------------------|--------|----------------------|-------|
| `none` | — | **R0** | none (`period_end = null`) | n/a | Default for new users. **Blocked from marking.** |
| `trial` | Free | **R50** | **7 days** | — | Explicit grant, not automatic. ~70 Sonnet papers. |
| `standard` | R1,000 | R300 | 30 days | R300 cap → **70%** | The default paid plan. |
| `pro` | R3,000 | R1,500 | 30 days | R1,500 cap → **50%** | 5× Standard allowance. Exam season. |

**Decisions baked in (see `../adr-002-pricing-and-plans.md`):**
- **Percentage-only display.** The UI never shows Rand or tokens — only "% left". This hides margins and lets us re-price or swap models silently.
- **Buy-again model.** No rollover, no top-ups, no pro-rating, no surge pricing. Run out → buy another period.
- **Per-paper cost reality:** Sonnet (`standard`) ≈ **R0.69/paper**, Opus (`high`) ≈ **R3.50/paper**. These are the constants used for batch pre-flight estimates.

---

## 4. Database functions (the only writers to `profiles`)

All three are `SECURITY DEFINER` with `search_path = public`, callable only with the service-role key.

### 4.1 `set_plan(p_user uuid, p_plan text)` — assign/renew a plan

Resets the billing period and the used counter. **This is how money becomes access.**

```sql
case p_plan
  when 'trial'    then v_cap := 50;   v_period := interval '7 days';
  when 'standard' then v_cap := 300;  v_period := interval '30 days';
  when 'pro'      then v_cap := 1500; v_period := interval '30 days';
  else                 v_cap := 0;    v_period := interval '30 days';
end case;

update public.profiles
   set plan = p_plan,
       allowance_cap_zar = v_cap,
       used_zar = 0,                    -- ← resets the per-period counter
       period_start = now(),
       period_end = now() + v_period
 where id = p_user;
```

- **`used_zar` always resets to 0.** Buying/renewing a plan gives a clean period. Lifetime spend in `usage_events` is untouched.
- The `else` branch (unknown plan, e.g. `'none'`) sets cap 0 — effectively a block.
- ⚠️ The trial period was **3 days** until 2026-06-12; corrected to **7 days** to match the product requirement (R50 / 7 days).
- 🔒 **One trial per email (P1-7, 2026-06-15).** When `p_plan = 'trial'`, `set_plan` looks up the user's email in `auth.users` and refuses (`trial_already_used`) if that email is already in `public.trial_claims`; otherwise it records the claim. The ledger is keyed by **email, not profile id**, so deleting and re-creating an account does *not* unlock a second trial. Paid plans (`standard`/`pro`) are never gated. Migration: `one_trial_per_email` (also in `db/supabase/one_trial_per_email.sql`). To re-grant a trial for testing: `delete from public.trial_claims where email = lower('<addr>');`

### 4.2 `add_usage(p_user, p_cost, p_papers, p_tier, p_file)` — record spend

```sql
insert into public.usage_events (user_id, papers, model_tier, cost_zar, file_name)
values (p_user, p_papers, p_tier, p_cost, p_file);
update public.profiles set used_zar = used_zar + p_cost where id = p_user;
```

Atomic-ish: appends the audit row and bumps the period counter. Called from the marking routes **after** a job succeeds, via `recordUsage()` (§6.3) which adds retries.

### 4.3 `handle_new_user()` — signup trigger

Trigger on `auth.users` insert:

```sql
insert into public.profiles (id, full_name)
values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
```

Inserts only `id` + `full_name`; everything else takes column defaults → **`plan='none'`, `cap=0`, `used=0`, periods `null`**. **New users therefore start at R0 and are blocked** until granted a plan. This is intentional (Michael's call, 2026-06-12): no automatic free usage.

---

## 5. Cost calculation — `lib/cost.ts`

Server-only. Converts Claude token usage into a Rand cost. Prices never ship to the client.

- **`USD_TO_ZAR = 18.5`** (hardcoded conversion).
- Per-token USD rates (per-million ÷ 1e6):

| Model | in | out | cacheWrite | cacheRead |
|-------|-----|-----|------------|-----------|
| `claude-sonnet-4-6` | $3/M | $15/M | $3.75/M | $0.30/M |
| `claude-opus-4-7` | $15/M | $75/M | $18.75/M | $1.50/M |

```ts
costZar(model, usage) =
  ( input_tokens*in + output_tokens*out
  + cache_creation_input_tokens*cacheWrite
  + cache_read_input_tokens*cacheRead ) * 18.5
```

Unknown models fall back to Sonnet rates. **When token rates or the FX rate change, this file is the single place to edit** — the percentage-only UI means no front-end change is needed.

---

## 6. Enforcement logic — `lib/usage.ts`

The single source of truth for "is this user allowed to mark?". Both marking routes call into it so they can't drift apart.

### 6.1 `isBlocked(profile): boolean`

```ts
if (!profile) return true;                                    // fail closed
const capHit = Number(used_zar) >= Number(allowance_cap_zar);
const timeUp = !!period_end && new Date(period_end) <= new Date();
return capHit || timeUp;
```

- **Enforced for EVERY plan, including `none`** — a `none` user has cap 0, so `0 >= 0` → blocked. This is the fix for the bypass bug (§8).
- **Missing profile fails closed** (blocked) — no profile means no allowance.

### 6.2 Batch cost estimate

`estimateBatchCostZar(papers: PaperPageSummary[], quality)` — called before submitting a batch so a near-cap user doesn't blow past their allowance. A batch goes to Anthropic in one shot with no mid-run stop, so this pre-flight check is the only guard.

Uses **batch-discounted rates** (50% off standard, matching what Anthropic actually bills for the Message Batches API) and differentiates page content:

| Content type | Token estimate | Why |
|---|---|---|
| Text page (extracted) | 600 tokens/page | Typed/digital PDFs, includes y-position markers |
| Image page (scanned) | 2,000 tokens/page | A4 scan at typical render resolution; cost notes put range at 1,000–2,000+ |
| Shared overhead (system + memo) | 1,700 tokens/paper as `cache_read` | Same prefix for all papers in a batch; caching kicks in after paper 1 |
| Output (JSON) | 400 tokens/paper | Annotations + summary |

The `affordable` count shown in rejection messages uses `estimate / papers.length` (the actual average from this specific batch) rather than a global constant.

### 6.3 `checkAllowance(): Promise<AllowanceCheck>` — the fail-CLOSED gate (P1-2)

The single pre-mark gate both routes call. **Policy: if anything needed to verify the allowance fails, marking is blocked.** No marking "blind" when a check errors out.

```
isServiceConfigured() === false   → { allowed: true }          // unmetered local/dev, nothing to enforce
auth lookup throws                → { allowed: false, 503, "verification_failed" }  + notifyOps
no userId (metered)               → { allowed: false, 401, "not_authenticated" }
profile read throws / returns err → { allowed: false, 503, "verification_failed" }  + notifyOps
isBlocked(profile) === true       → { allowed: false, 402, "allowance_exhausted" }  // normal, no page
otherwise                         → { allowed: true, userId, profile }
```

- **Fail-closed everywhere.** A Supabase/auth outage now *blocks* marking (it used to fail open on the instant route — P1-2). Better to turn a user away for a minute than mark unmetered.
- **Ops gets paged** (`notifyOps`, `lib/notify.ts`) only on *genuine backend failures* (`verification_failed`) — not on the normal over-limit case, which would be alert spam. So a silent outage that's turning users away gets noticed. Channel: `OPS_ALERT_WEBHOOK_URL` (ntfy.sh) — see Category 3 §8.3.
- **The user is told why.** The client maps each code to a plain-English banner via `blockMessage()` in `app/page.tsx` (e.g. *"We couldn't verify your plan just now … you weren't charged."*).
- Returns the `profile` on success so the batch route can run its overspend pre-flight without a second DB read.

### 6.4 `recordUsage(userId, costZar, papers, tier): Promise<boolean>`

Calls `add_usage` with **3 retries + exponential-ish backoff (250ms × attempt)**. Checks the supabase-js `error` return (the old code did `await svc.rpc(...)` with no error check, so a failed write was swallowed → free usage). If all attempts fail, parks the event in the Cloudflare D1 dead-letter buffer (§11b / §13b) and pages ops; returns `false`. Auto-drains the buffer on the next successful write.

---

## 7. Where enforcement is wired in

### 7.1 Instant marking — `app/api/mark/route.ts`

1. Reject if no pages / no API key (503).
2. **Gate:** `const gate = await checkAllowance()` (§6.3); if `!gate.allowed` return `gate.status` + `{ error: gate.error }`. **Fail-closed** — an auth/DB error blocks marking, not lets it through.
3. Call Claude, parse result.
4. **Record:** `recordUsage(userId, costZar(model, usage), 1, quality)`.

> ✅ **Fail-CLOSED (P1-2, fixed 2026-06-15).** The old pre-check sat in a `try/catch … continuing` that marked the paper anyway on an infra error. It now defers to `checkAllowance()`, which blocks (`verification_failed` 503) and pages ops on any verification failure. Availability is traded for never giving away unmetered marking.

### 7.2 Batch marking — `app/api/mark/batch/route.ts`

**POST (submit):**
1. Reject if no papers / no key.
2. **Gate:** `const gate = await checkAllowance()` (§6.3) — same fail-closed gate as instant; if `!gate.allowed` return `gate.status` + `{ error }`. Returns `profile` for the next step.
3. **Pre-flight overspend guard:** `estimate = estimateBatchCostZar(pageSummaries, quality)`; if `estimate > (cap − used)` → `402 { error: "allowance_exhausted", detail, affordable }` where `affordable = floor(remaining / per-paper estimate)`. Tells the user how many papers they *can* afford.
4. Submit all papers to the Anthropic Batch API in one `batches.create`.

**GET (poll/retrieve):** when the batch ends, sum real `costZarBatch` across results (batch-discounted rates — what Anthropic actually charges), then `recordUsage(userId, totalCost, paperCount, quality)` once.

> **Plan expiring mid-batch (Problem 4 — resolved by design):** the period is only checked on POST (submit). A batch can take minutes; if the plan expires while it runs, the GET handler still delivers the marked papers **and still records the usage like any other batch** — Anthropic already ran and charged us, so the cost is real and must be counted. We do **not** try to block or refund it. Exposure is bounded to one batch (which already passed the pre-flight estimate on submit). What changed is *visibility*: the user is told their plan ended via the `PlanNotice` banner (§8.3) and the Settings → Plan expiry line (§8.4), so they renew rather than assuming they still have access.

---

## 8. Surfaces the user sees

### 8.1 `components/AllowanceBar.tsx` (sidebar)

- Reads `plan, allowance_cap_zar, used_zar` for the logged-in user.
- `pct = cap > 0 ? min(100, round(used/cap*100)) : null`.
- Shows the plan label + **"{100−pct}% left"**, a progress bar, and a **low-balance warning at ≤15%** (red). For `cap = 0` (i.e. `none`) it shows **"Buy a plan to start marking →"**.
- **Never shows Rand or tokens.** Links to `/plans`. Re-renders on a custom `allowance-refresh` window event.

### 8.2 `app/plans/page.tsx` (pricing + pay)

- Two cards: **Standard R1000**, **Pro R3000** (Pro flagged "Most popular"). Trial is *not* sold here — it's a manual grant.
- **"How to pay":** (1) EFT the plan amount, (2) WhatsApp proof, (3) activated within 24h.
- **Banking details:** MA Bernard · Investec · acc **10012930071** · branch **580105**.
- WhatsApp deep-link to **079 905 0642** (`27799050642`) with a pre-filled activation message.

### 8.3 `components/PlanNotice.tsx` (top-of-page banner) — Problem 4

- Reads the profile client-side and computes `blockReason()` (from `lib/allowance.ts`).
- Shows a red banner **only** for `expired` ("Your plan has expired") or `limit` ("You've reached your plan limit"), each with a **"Buy a new plan"** button → `/plans`.
- Brand-new `no_plan` users are intentionally **not** shown this banner — the `AllowanceBar` nudge ("Buy a plan to start marking") covers them; an "expired" banner would be wrong for someone who never had a plan.
- Re-renders on the `allowance-refresh` event, so it appears the moment a batch finishes and tips the user over.

### 8.4 `components/SettingsPanel.tsx` → Plan section — Problem 4

- On open, fetches `plan, period_end` and shows the plan label plus **"Renews/expires on {date}"** (or **"Expired on {date}"** in red if past).
- Button reads **"Buy a plan"** when expired/`none`, else **"Manage plan"** → `/plans`.

> **Shared logic:** the cap/period decision lives once in `lib/allowance.ts` (`blockReason`, pure & client-safe). `lib/usage.ts`'s `isBlocked()` delegates to it, so the server gate and these UI notices can never disagree about who is blocked. `lib/usage.ts` must stay server-only (it imports the service client) — never import it into a client component; import from `lib/allowance.ts` instead.

---

## 9. The payment flow (end to end)

```
User picks plan on /plans
   → EFTs the amount to the Investec account
   → WhatsApps proof of payment to 079 905 0642
   → Michael verifies, runs in Supabase SQL editor:
        select id from auth.users where email = '<their email>';
        select public.set_plan('<that-uuid>', 'standard');   -- or 'pro' / 'trial'
   → set_plan resets used_zar=0, sets cap + 30-day (or 7-day) period
   → AllowanceBar shows % left; marking is unblocked
```

- **No card payments, no gateway, no webhook** yet. Entirely manual. SLA: activated within 24 hours.
- Renewal / buy-again = run `set_plan` again (fresh period, counter reset).

---

## 10. Lifecycle scenarios (the truth table)

| Situation | `plan` | cap | used | period_end | Can mark? |
|-----------|--------|-----|------|------------|-----------|
| Just signed up | none | 0 | 0 | null | **No** (0 ≥ 0) |
| Granted trial | trial | 50 | 0 | now+7d | Yes |
| Trial, spent R50 | trial | 50 | 50+ | future | **No** (cap hit) |
| Trial, day 8 | trial | 50 | 10 | past | **No** (expired) |
| Standard, mid-period | standard | 300 | 2.20 | future | Yes |
| Standard, period ended | standard | 300 | 50 | past | **No** (expired) |
| Renewed (set_plan again) | standard | 300 | 0 | now+30d | Yes |

---

## 11. Known bugs fixed & remaining gaps

**Fixed (2026-06-12):**
- 🐛 **`plan='none'` bypassed all enforcement.** Old check was `if (profile.plan !== "none")`, so R0 new users could mark unlimited free. Verified live: Lila & Nicola (none/R0) flipped from ALLOWED → BLOCKED; paying account unaffected. Fix: `isBlocked()` enforces every plan.
- 🐛 **Batch overspend.** No mid-batch guard → a near-empty trial could submit 80 papers. Fix: pre-flight estimate (§6.2/§7.2).
- 🐛 **Silent `add_usage` failure → free usage.** supabase-js returns errors instead of throwing; old code never checked. Fix: `recordUsage()` retries + loud CRITICAL log.
- 🐛 **Trial was 3 days.** Corrected to 7 days / R50 in `set_plan`.

**Fixed (2026-06-15):**
- 💸 **Batch was metered at full price.** The batch GET handler recorded usage with standard `costZar`, but the Message Batches API bills **50% less**. Allowance was draining ~2× too fast. Fix: added `BATCH_RATES` + `costZarBatch()` in `lib/cost.ts`; the GET handler now uses `costZarBatch`.
- 📐 **Flat per-paper estimate ignored content type.** Pre-flight used a single R0.69/R3.50 constant regardless of text vs scanned pages. Fix: `estimateBatchCostZar(PaperPageSummary[], quality)` now estimates token-by-token (text page ≈600t, image page ≈2000t, shared system+memo ≈1700t cache-read, output ≈400t) on **batch-discounted** rates; `affordable` count uses this batch's real average.
- 🔔 **Plan expiring mid-batch was invisible (Problem 4).** Batch still records normally (cost is real); now the user is told via the `PlanNotice` banner (§8.3) + Settings → Plan expiry (§8.4). Shared decision logic extracted to `lib/allowance.ts`.
- 🛟 **`recordUsage` silent failure → free usage (Problem 8).** Failed Supabase writes are now parked in a Cloudflare D1 dead-letter buffer (`lib/pendingUsage.ts`) and auto-drained on the next successful write; `notifyOps` (`lib/notify.ts`) alerts on failure. See §11b + §13b. **Live in production** (D1 `automark-usage-dlq` provisioned + deployed).
- 💰 **Duplicate revenue triggers (P1-1).** `log_plan_revenue()` + its trigger double-logged every paid-plan update. **Dropped** (migration `drop_duplicate_revenue_trigger`); only `log_revenue_event()` remains. `revenue_events` was empty — no data fix needed.
- 🚪 **Pre-check failed OPEN → free marking during an outage (P1-2 / P4-2).** The instant route wrapped its allowance pre-check in `try/catch … continuing`, so a Supabase/auth error let the paper through unmetered; batch meanwhile 500'd. Both routes now share one **fail-CLOSED** gate, `checkAllowance()` in `lib/usage.ts` (§6.3): if the user can't be resolved or the profile can't be read, marking is **blocked** (`verification_failed` 503 / `not_authenticated` 401) and nothing is sent to Anthropic. Genuine backend failures also page ops via `notifyOps`. The client maps the new codes to plain-English banners (`blockMessage()` in `app/page.tsx`).
- 🔒 **Trial farming — one trial per email (P1-7).** `set_plan` now refuses a second `'trial'` grant for an email already in the persistent `public.trial_claims` ledger (keyed by email so it survives account deletion). Paid plans unaffected. Migration `one_trial_per_email` (`db/supabase/one_trial_per_email.sql`); see §4.1.

**Deliberately not changed:**
- **No grace period after `period_end`.** Hard cutoff is correct given "cut users off when the plan runs out." Adding a buffer would hand out free post-expiry usage.

**Revenue ledger (auto-logging) — now single-trigger (fixed 2026-06-12 / cleaned 2026-06-15):**
- A **`revenue_events` ledger table** on `profiles` logs a row automatically when a **non-owner** moves onto / renews a paid plan. The keeper is **`log_revenue_event()`**, fired by two triggers: `trg_log_revenue_insert` (AFTER INSERT, paid plans) and `trg_log_revenue_update` (AFTER UPDATE when `plan` or `period_start` changes). It excludes owner test rows (`bernardmanne3@gmail.com`), prices via `plan_price()`, and sets `search_path`.
- ✅ The duplicate `log_plan_revenue()` + `trg_log_plan_revenue` (which double-logged every paid-plan update) were **dropped** (migration `drop_duplicate_revenue_trigger`). `revenue_events` was empty, so no reconciliation was needed.

**Not built yet (tracked in `../expansion-plan.md` Phase 2):**
- Automated payment gateway (PayFast) + webhook handler (the ledger exists, but nothing *automatically* triggers `set_plan` from a payment yet — activation is still manual EFT/WhatsApp/SQL).
- **Self-serve "Start free trial" button** — trial is currently a manual SQL grant; new users hit a wall until granted.
- Trial-expiry / low-balance email warnings (these are Category 3 — UI/notifications).
- Mid-batch *hard* enforcement (current guard is a pre-flight estimate, not a per-paper stop).

---

## 11b. Designed solutions — agreed, not yet built

These two are **decided** (Michael, 2026-06-15) but deferred. Documenting so the next session can implement without re-deciding.

### Problem 7 — batch estimate can undershoot real cost (P1-4)

**Problem.** Per-page token budgets (text ≈600t, image ≈2000t) are conservative but not guaranteed ceilings. An unusually long/dense answer script or a huge memo can push real tokens past the estimate, so a batch that passed the pre-flight on submit still ends up over cap once real `costZarBatch` is recorded.

**Rejected approach:** a flat safety multiplier (`estimate × 1.15`). Michael's call (2026-06-15): *"we should not times the estimated amount by 1.15 or something stupid like that."* An arbitrary cushion is both too blunt (cuts honest users off early) and not a real ceiling.

**Agreed design (Michael, 2026-06-15) — user-triggered, self-correcting chunked batches:**

The estimate is never trusted as a hard ceiling. When a batch is too big for the remaining allowance we don't silently reject it — we offer the user a choice, and if they opt in, an automatic loop marks as much as the plan covers, one chunk at a time, reconciling against *actual* spend so an estimate miss can only ever overshoot by a single chunk.

**A. Pre-flight — when the batch is over the limit.** On submit, estimate the whole job. If the estimate exceeds the remaining allowance, show a dialog. **No Rand figures appear** (see "Privacy" below) — only document/page counts:

> **This batch is over your spending limit.**
> We estimate this run of **{N} documents** ({P} pages) is more than your plan can mark right now.
>
> [ **Mark in chunks** ]   [ **Remove some documents** ]
>
> ▾ *More info* (disclosure under "Mark in chunks"): *"We'll mark your documents in smaller batches instead of all at once. After each batch we check how much of your allowance is left and automatically send the next one — getting smaller as you near your limit. Marking stops on its own when your allowance runs out, so you only get through the documents your plan covers; the rest are left untouched for after you renew. You don't need to do anything while it runs."*

- **"Mark in chunks"** → starts the automatic loop (B).
- **"Remove some documents"** → **cancels the run entirely** and returns the user to the start page so they can take documents out and try again. Nothing is marked or charged.

**B. The chunk loop — runs automatically and independently.** Once "Mark in chunks" is chosen the loop runs on its own, with **no further prompts**, until the documents run out or the allowance does:

1. **Size the chunk.** Add **whole documents** (papers are atomic — you can't mark half a paper) until the next document would push the estimate past what the remaining allowance can handle, capped at the hard ceiling of ~**100 documents**. The loop works *because* the per-page estimate is deliberately conservative (over-estimates): actual usually lands under, leaving a shrinking remainder for the next chunk (see safety rule C16).
2. **Submit + wait.** The chunk is a normal Anthropic batch (full 50% batch discount, identical marking/stamping). Poll to completion.
3. **Reconcile against actual cost.** Record the chunk's real `costZarBatch` and re-read the profile:
   - **Over the limit** (`used_zar ≥ cap` after recording) → the amount it went over is **written off** (accepted loss, bounded to one chunk). Marking stops because the cap is now reached — this is the **existing** block mechanism, not a new flag (see C9) — and the user is told *"You've reached your usage limit."*
   - **Still allowance left** → continue.
4. **Shrink the next chunk.** Each successive chunk is sized smaller as the remaining allowance falls, down to a floor of **~R10 estimated per chunk** (internal figure, never shown). Once chunks reach the R10 floor they stay at R10 until the documents or the allowance run out. *Rationale:* smaller chunks near the limit keep the final write-off small; the R10 floor stops the loop doing hundreds of tiny round-trips.
5. **Repeat** from step 1.

**Privacy of figures (hard rule, consistent with ADR-002).** The user is **never** shown the Rand estimate or actual cost. Everything is expressed in **documents**, **pages**, or a qualitative *"over the estimated amount / over your limit."* The R10 chunk floor, the per-page estimate, and all Rand maths stay server-side.

Why this works: every chunk is reconciled against *actual* usage before the next is sent, so a wrong estimate overshoots by at most one chunk — never the whole job — and because the chunks shrink as the limit nears, even that last overshoot is small. Overshoot is explicitly accepted ("I will write off what is lost") in exchange for never blocking an honest user prematurely and never marking blind.

**C. Safety invariants — the loop MUST obey these.** An automatic loop that submits batches, spends money, and runs unattended is dangerous if any of these is missed. These are requirements, not nice-to-haves.

*Termination (the loop must always end):*
- **C1 — Every iteration makes progress or stops.** A chunk always contains **≥ 1 whole document**. If not even one document fits the remaining allowance, the loop **stops** (limit-reached) — it must never spin sizing an empty chunk.
- **C2 — The R10 floor is a floor on chunk *size*, not a refusal to finish.** When remaining allowance is below the next chunk's estimate, do **one final chunk** of the smallest unit (one document) — accept it may cross the cap (write-off) — then stop. The loop must not stall just because the tail doesn't divide evenly.
- **C3 — Hard iteration ceiling as a backstop.** `maxIterations = documentCount` (each iteration marks ≥1 document, so it can't legitimately exceed that). If exceeded → abort + `notifyOps` (it signals a logic bug, not normal operation).
- **C4 — Guard the arithmetic.** `estimatedCostPerPage > 0` always; a `0`/`NaN`/`Infinity` estimate **aborts** the loop, it never translates to "mark everything."

*Money safety:*
- **C5 — Strict sequencing, never pipeline.** submit → poll to completion → **await a confirmed `recordUsage`** → re-read `used_zar` → size next. Sizing against a not-yet-committed write would oversize and overspend.
- **C6 — A failed `recordUsage` STOPS the loop.** If a chunk's usage write fails (and is parked in the D1 dead-letter buffer, Problem 8), the live `used_zar` is stale (too low). The loop can no longer trust "remaining," so it **halts immediately** rather than size another chunk against stale data, and tells the user to retry later. The parked event reconciles on the next successful write.
- **C7 — Idempotency: each document is marked at most once.** Advance a "done" pointer only after a chunk is fully recorded; a transient error must never re-submit an already-marked chunk (that would double-charge **and** double-mark). Keyed on the per-paper `custom_id`.
- **C8 — Overshoot is measured against the cap, on one chunk.** "Over the limit" = `used_zar ≥ cap` *after* recording — **not** "chunk actual > chunk estimate." A chunk that ran over its own estimate but stayed under the cap is fine; it just shrinks the next chunk. Only the single cap-crossing chunk is written off.

*The block is not a new destructive state:*
- **C9 — "Block the account" = the normal cap is now reached** (`used_zar ≥ cap` → `isBlocked` true via existing metering). The loop sets **no** new persistent "blocked" flag; a plan renewal (`set_plan` resets `used_zar`) restores access as usual. Never invent a separate lock that needs manual clearing.

*Concurrency:*
- **C10 — Single-flight.** While the loop runs, the UI **locks** all marking (no second run, no instant marking; quality/mark-type settings frozen). Two concurrent loops could each pass their own pre-flight and overshoot by more than one chunk. The server's per-chunk gate is the real backstop, but the client lock prevents the race up front.

*Client lifecycle (the loop is browser-driven):*
- **C11 — Tab close / reload mid-loop is safe for the user but leaks ≤1 chunk's cost to us.** Un-submitted documents are simply never sent (no overspend, no marking). But a chunk already *submitted* to Anthropic finishes server-side and is never retrieved/recorded → **we** pay Anthropic, the user isn't charged and doesn't get those papers. Bounded to **one in-flight chunk**. Mitigation now: warn *"keep this tab open while marking."* Mitigation later (roadmap): server-side batch tracking + resume. This is the existing closed-tab gap (Cat 4 §3.2); the loop inherits it, capped at one chunk.

*Failure handling:*
- **C12 — Bounded retries on a failed submit/poll** (≤ 2), then stop with *"Marked X of Y — couldn't continue, please try again."* A submit/poll failure is **never** read as allowance-exhausted and **never** silently re-marks.
- **C13 — `verification_failed` from the gate stops the loop** (infra problem; distinct message and cause from the expected `allowance_exhausted` stop).
- **C14 — Per-paper failures inside a chunk** are surfaced to the user (which documents failed), not auto-re-marked (could loop) and not silently dropped.

*Server-side (defense in depth — the client loop is UX; the server is the enforcement):*
- **C15 — The ~100-doc ceiling and the per-chunk estimate gate are enforced in the batch route**, not only the client. A buggy or hostile client still cannot submit a 10 000-doc batch, nor a chunk whose estimate already exceeds remaining.

*Estimate assumption:*
- **C16 — The per-page estimate must stay conservative.** The loop iterates and stays safe *because* actual usually lands under the estimate. If the estimate ever skews low, chunks cross the cap more often (more write-offs). Keep the image/text token budgets biased high; when recalibrating from `usage_events`, never tune below real observed costs.

**Implementation sketch (not yet built):**
- `lib/usage.ts`: `maxDocsForBudget(remainingZar, quality, docs)` (returns whole documents that fit, ≥0); constants `MAX_BATCH_DOCS = 100`, `MIN_CHUNK_ZAR = 10`. Pure, unit-testable — test the termination edges (C1–C4): zero budget, one oversized document, NaN estimate.
- Over-limit dialog component (the **A** copy above) with the "more info" disclosure; "Remove some documents" resets the run and routes back to start.
- Client chunk loop (`app/page.tsx` / `lib/markPaper.ts`): runs automatically once opted in — size → submit → poll → **await record** → re-read remaining → shrink → next. Enforces C5 (sequencing), C6 (stop on record failure), C7 (done-pointer idempotency), C10 (a `loopRunning` lock that disables all other marking), C12 (≤2 submit retries then stop), and the C3 iteration ceiling. Progress shown as "chunk k — {done}/{total} documents" **in documents/pages only**; on `allowance_exhausted` shows the limit-reached banner, on `verification_failed` a distinct "try again later" banner (C13).
- Batch route POST stays the per-chunk gate and must also enforce **C15** server-side: reject a submission over `MAX_BATCH_DOCS` or whose estimate already exceeds remaining (it already does the estimate part). **Reuse, don't re-derive:** the route's existing `402 { affordable }` response already computes how many documents fit — the loop can submit the remaining set, read `affordable`, send exactly that many, and repeat; `affordable === 0` means stop (C1). That keeps the sizing maths in one tested place server-side instead of duplicated on the client.
- **Write-offs page ops:** when a chunk crosses the cap, `notifyOps` records that real money was eaten (you can't see it any other way, since the user never sees Rand).
- **Recalibrate constants from real data** (still worth doing, and keep them conservative — C16): compare predicted vs actual `usage_events` costs and tune the token budgets. (Pairs with the drift query in P1-6.)

### Problem 8 — `recordUsage` can fail silently → free usage (P1-6) ✅ BUILT (2026-06-15)

**Problem.** `recordUsage` runs **after** marking. If all 3 retries fail (sustained Supabase outage), the user keeps their marked papers but `used_zar` is never updated — unrecoverable free usage. The old code only logged CRITICAL; nothing self-corrected.

**What was built — a durable dead-letter buffer that drains itself:**

1. **Park, don't lose.** When `recordUsage` exhausts its 3 retries, it calls `enqueuePendingUsage()` (`lib/pendingUsage.ts`) to store the event `{userId, costZar, papers, tier, ts}`, then `notifyOps()` (`lib/notify.ts`) to alert.
2. **Auto-drain on recovery.** On the **next successful** `add_usage`, `recordUsage` fires `drainPendingUsage()` — replays each parked event through `add_usage` and deletes it on success. **No manual step**; the next healthy write reconciles everything. (Fire-and-forget for latency; idempotent, so if a Workers instance is cut off before it finishes, the following successful write retries the rest.)
3. **Detection backstop.** CRITICAL log + the §13 drift reconcile query remain as the safety net.

> **Answering Michael's question:** yes — exactly that. Usage is parked locally and flushed into the DB automatically the next time Supabase is healthy. You don't do anything manually.

**Where the buffer lives — Cloudflare D1, *not* Supabase.** Supabase is the thing that's down when `recordUsage` fails, so the buffer can't live there. There's no persistent local disk on Workers either. We use a **D1** table `pending_usage` (binding `USAGE_DLQ`). D1 (real rows) is preferred over KV (last-write-wins on one key → lost updates under concurrency). Local `next dev` has no binding → `lib/pendingUsage.ts` falls back to an in-process array so dev doesn't crash (NOT durable; a warning is logged). **Production must have the binding** — see §13b.

**Notify on Supabase failure.** Fired from the same failure path that parks the event, via `notifyOps()`. The alert **channel itself is documented in Category 3 (Notifications) §8.3** — `lib/notify.ts`, the `OPS_ALERT_WEBHOOK_URL` secret, ntfy.sh setup. Until that secret is set it's log-only (still in Cloudflare observability) — no breakage.

**Still open (small):** the `isBlocked` pre-check's Supabase error is **not** yet wired to `notifyOps` (only the record path is). And there's no time-based cron drain — recovery relies on the next marking request, which is fine for any active account. Both are easy follow-ups.

---

## 12. Invariants — do not break these

1. **Never show Rand or token counts to users.** Percentage only. This is load-bearing for margin secrecy and silent re-pricing.
2. **Only service-role functions write to `profiles`.** The client may read its own row; it must never write plan/usage.
3. **`used_zar` is per-period, not lifetime.** Lifetime = `usage_events`. Don't conflate them.
4. **New users start at R0/blocked.** Any change that lets `none` users mark re-introduces the bypass bug.
5. **Enforcement logic lives in `lib/usage.ts` only.** Don't re-inline cap/period checks in routes — call `isBlocked()`. The pure cap/period decision is in `lib/allowance.ts` (`blockReason`) so client components can share it; `isBlocked()` delegates to it. Never import `lib/usage.ts` into client code (it pulls in the service-role client) — import `lib/allowance.ts` instead.
6. **Cost/price constants live in `lib/cost.ts` only.** One place to change rates or FX.

---

## 13. Operational SQL cookbook

```sql
-- Grant / renew a plan (the activation step)
select public.set_plan('<uuid>', 'standard');   -- 'trial' | 'standard' | 'pro' | 'none'

-- Find a user's uuid from their email
select id from auth.users where email = 'someone@example.com';

-- See every customer's current state
select full_name, plan, allowance_cap_zar, used_zar, period_end from public.profiles order by plan;

-- Lifetime spend for one user (audit trail — never reset)
select sum(cost_zar) as lifetime_zar, sum(papers) as lifetime_papers
from public.usage_events where user_id = '<uuid>';

-- Revenue-ish: who is on a paid plan right now
select count(*) filter (where plan='standard') as standard,
       count(*) filter (where plan='pro')      as pro
from public.profiles where period_end > now();

-- Drift check (Problem 8 / P1-6): recorded used_zar vs what usage_events says
-- was spent this period. Any non-zero drift means a recordUsage write was lost.
select p.id, p.full_name,
       p.used_zar                                as recorded,
       coalesce(sum(e.cost_zar), 0)              as actual,
       p.used_zar - coalesce(sum(e.cost_zar), 0) as drift
from public.profiles p
left join public.usage_events e
  on e.user_id = p.id
 and e.created_at between p.period_start and p.period_end
group by p.id, p.full_name, p.used_zar, p.period_start, p.period_end
having abs(p.used_zar - coalesce(sum(e.cost_zar), 0)) > 0.01;
```

---

## 13b. Setup — dead-letter buffer (Problem 8)

✅ **Already provisioned (2026-06-15):** the D1 database **`automark-usage-dlq`** exists (id `95927901-fb97-484c-b28f-f77b2fa3a607`, region EEUR), the `pending_usage` table is created, and the real id is wired into `wrangler.jsonc` (binding `USAGE_DLQ`). The binding only takes effect in production **after the next `npx wrangler deploy`**.

**Remaining (optional) — phone alerts:**
```bash
npx wrangler secret put OPS_ALERT_WEBHOOK_URL    # e.g. https://ntfy.sh/automark-<random>
```
Until that secret is set, `notifyOps` is log-only (still visible in Cloudflare observability).

**If you ever need to recreate it from scratch:**
```bash
npx wrangler d1 create automark-usage-dlq        # paste the new id into wrangler.jsonc
npx wrangler d1 execute automark-usage-dlq --remote --file=db/d1/pending_usage.sql
```

**Inspect / manually drain the buffer:**
```bash
npx wrangler d1 execute automark-usage-dlq --remote --command "SELECT * FROM pending_usage ORDER BY id;"
```
Parked rows drain themselves on the next successful marking write; this is just for visibility.

---

## Problems / To-Fix Backlog

> Severity: 🔴 fix before real paying customers · 🟠 important · 🟡 minor/polish · 🔵 not-built/roadmap · 🟢 fixed · ⚪ won't-fix/accepted. IDs are stable references.

| ID | Sev | Problem | Fix direction |
|----|-----|---------|---------------|
| ~~**P1-1**~~ | 🟢 | ✅ **FIXED (2026-06-15).** Duplicate revenue triggers — `log_plan_revenue` + its trigger dropped (migration `drop_duplicate_revenue_trigger`); only `log_revenue_event` (insert+update) remains. `revenue_events` was empty. (= P6-1) | Done. |
| ~~**P1-2**~~ | 🟢 | ✅ **FIXED (2026-06-15).** Instant pre-check failed OPEN on a Supabase error (free marking during an outage); batch 500'd. Both routes now share one **fail-CLOSED** gate `checkAllowance()` (§6.3): any verification failure blocks marking (`verification_failed`/`not_authenticated`) and pages ops via `notifyOps`; client shows a plain-English banner. (= P4-2) | Done. |
| ~~**P1-3**~~ | ⚪ | **Per-paper overspend** — instant only blocks when *already* over cap; a user at 99% can mark one more (~R3.50 max) paper and exceed. | **WON'T FIX — accepted (Michael, 2026-06-15):** *"it is not an issue, I will write that off."* Bounded to one paper; the loss is written off by design. |
| **P1-4** | 🟠 | **Batch estimate can under-block** (Problem 7) — per-page token budgets (text ≈600t / image ≈2000t) are conservative but not guaranteed ceilings; a dense script can run higher and the batch overspends. | **Redesigned (§11b), not built.** Over-limit batch shows a dialog: **"Mark in chunks"** (auto loop) or **"Remove some documents"** (cancel → start). Loop runs automatically: ~100-doc cap + page budget sized to remaining allowance, chunks shrink toward a **R10/chunk floor** as the limit nears; reconcile each against *actual* cost; on overspend write off the overage + block. **Never shows Rand — documents/pages only.** Overshoot bounded to one (shrinking) chunk. |
| **P1-5** | 🟡 | **Hardcoded cost constants** (`USD_TO_ZAR = 18.5`, token prices in `lib/cost.ts`) → silent margin drift when Anthropic re-prices or ZAR moves. | Add a periodic review note, or source rates from config. |
| **P1-6** | 🟢 | **`recordUsage` silent failure → free usage** (Problem 8) — ✅ **BUILT + LIVE (2026-06-15).** Failed writes are parked in a **Cloudflare D1** dead-letter buffer (`pending_usage`, binding `USAGE_DLQ`) and auto-drained on the next successful `add_usage`; `notifyOps()` alerts via `OPS_ALERT_WEBHOOK_URL`. The pre-check error path now also pages ops (done via `checkAllowance()`, P1-2). See §6.3 / §11b / §13b. | Optional only: a scheduled cron drain (currently drains opportunistically on the next write); set `OPS_ALERT_WEBHOOK_URL` secret to enable phone push. |
| ~~**P1-7**~~ | 🟢 | ✅ **FIXED (2026-06-15).** Trial farming — `set_plan` now enforces **one trial per email** via a persistent `trial_claims` ledger (keyed by email, survives account deletion); a second trial raises `trial_already_used`. Paid plans unaffected. Migration `one_trial_per_email`; see §4.1. | Done. (Multi-email farming is out of scope by design — "one per email" was the chosen policy.) |
| **P1-8** | 🔵 | **Not built** — PayFast gateway + webhook → auto `set_plan`; self-serve "Start free trial" button. | Expansion plan Phase 2. |

---

## 14. Key files (quick reference)

| File | Role |
|------|------|
| `lib/usage.ts` | Server enforcement (`isBlocked`, `recordUsage`, batch estimate). Server-only — never import client-side. |
| `lib/allowance.ts` | Pure, client-safe cap/period logic (`blockReason`, `formatExpiry`, `isExpired`); `isBlocked` delegates here |
| `lib/pendingUsage.ts` | Dead-letter buffer (Cloudflare D1 `pending_usage`, binding `USAGE_DLQ`) — parks + auto-drains failed usage writes (Problem 8) |
| `lib/notify.ts` | `notifyOps()` — ops alerts via `OPS_ALERT_WEBHOOK_URL` (else log-only) |
| `db/d1/pending_usage.sql` | D1 schema for the dead-letter buffer |
| `lib/cost.ts` | Token → Rand cost; `costZar` (standard), `costZarBatch` (batch 50% off), price/FX constants |
| `app/api/mark/route.ts` | Instant marking — pre-check + record |
| `app/api/mark/batch/route.ts` | Batch — pre-check + pre-flight + record |
| `components/AllowanceBar.tsx` | % allowance display (sidebar) |
| `components/PlanNotice.tsx` | Top-of-page banner for expired / limit-reached + "Buy a new plan" |
| `components/SettingsPanel.tsx` | Settings → Plan section (expiry date + manage/buy) |
| `app/plans/page.tsx` | Pricing + manual EFT/WhatsApp flow |
| DB: `profiles`, `usage_events` | Customer state + audit log |
| DB: `set_plan`, `add_usage`, `handle_new_user` | The only writers to plan/usage state |
| `../adr-002-pricing-and-plans.md` | Why the prices/margins/%-display are what they are |
