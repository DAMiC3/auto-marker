# AutoMark Expansion Plan
**Status:** Living document — updated as plans are confirmed  
**Date:** 2026-06-05  
**Author:** Michael Bernard  
**Stack context:** Next.js 16 · Cloudflare Workers · Supabase · Anthropic SDK

---

## 1. Current State Snapshot

AutoMark is a browser-based exam marking tool. The entire pipeline runs client-side or via thin Next.js API routes:

| Layer | Current implementation | Capacity concern |
|---|---|---|
| PDF ingestion | File System Access API (browser) | Chrome/Edge only; large PDFs crash tabs |
| Text extraction | pdfjs-dist (browser) | Memory-bound per device |
| AI marking | `/api/mark` → Anthropic directly | No queue, no rate limiting |
| Batch mode | Browser polls every 5 s | Browser must stay open |
| Usage metering | **Not built** | No spend enforcement |
| Storage | User's local filesystem | No audit trail, no cloud |
| Payments | Manual EFT | Does not scale past ~20 customers |
| Monitoring | **None** | Blind to failures |
| POPIA compliance | Implicit (paid Claude tier) | No audit log, no deletion workflow |

---

## 2. Risk Register — What Breaks First

Ordered by likelihood × impact as customer count grows.

### Risk 1 · No usage metering (Critical — blocks monetisation)
Without per-user tracking of API spend, users can consume unlimited tokens. A single Opus batch on 80 papers costs ~R280. One power user on the Standard plan (R300 API cap) could burn through the budget in one session and you'd have no way to stop them.

**Trigger:** First paying customer.

### Risk 2 · Anthropic rate limits under concurrent load
Anthropic enforces per-account rate limits (requests per minute, tokens per minute). If 10+ lecturers all submit batches at the same time (think: 11pm before a deadline), requests will be rejected with 429s. There is currently zero retry or queue logic.

**Trigger:** ~10 simultaneous active users.

### Risk 3 · Browser must stay open for batch jobs
The batch polling loop runs in the browser. If a lecturer closes the tab or their laptop sleeps mid-batch, the job result is lost. They have to re-run the entire batch.

**Trigger:** First lecturer who gets burned by this.

### Risk 4 · Cloudflare Worker CPU time limits
Cloudflare Workers have a 30-second CPU time wall on the paid plan, 50ms on the free plan. Server-side PDF processing (if ever moved there) will hit this. Even the current API routes could time out on large batches.

**Trigger:** Any attempt to move heavy processing server-side.

### Risk 5 · Manual EFT payments don't scale
Collecting EFT payments, manually checking bank statements, and activating plans is viable for 5–10 customers. At 30+ it becomes a part-time job. At 100+ it is impossible.

**Trigger:** ~15–20 customers.

### Risk 6 · No error visibility
No monitoring, no alerting. If the marking pipeline fails silently (Anthropic returns a malformed response, Supabase is down, a Worker crashes), you will find out from an angry lecturer, not a dashboard.

**Trigger:** First customer complaint you could have caught earlier.

### Risk 7 · POPIA exposure at scale
Student PDFs contain names, student numbers, and exam answers. Currently these are passed directly to Anthropic. On the paid Claude tier this is acceptable, but there is no audit log, no retention policy, and no data subject deletion workflow. As customer count grows, so does regulatory exposure.

**Trigger:** Any university IT/legal review of the product.

### Risk 8 · File System Access API locks out non-Chrome users
The current file picker only works in Chrome and Edge. Firefox and Safari users (and all mobile users) are completely locked out. This artificially limits the addressable market.

**Trigger:** First customer who uses Firefox or a Mac with Safari.

---

## 3. Expansion Phases — Michael's Roadmap

### Phase 1 — UI/UX Overhaul
*Goal: any lecturer can use the app without help on their first session*

The current UI assumes the user already knows what they're doing. Phase 1 fixes that.

**1A · Onboarding help system**  
A help button that is large and prominent on first launch — impossible to miss. After the user has completed their first marking job, it shrinks and moves to a fixed corner of the screen where it stays available but doesn't crowd the workspace. Content inside: step-by-step walkthrough of the full flow (connect folder → pick papers → select memo → mark → download). Written in plain language, not technical terms.

Implementation approach: track first-launch state in `localStorage` (`automark_has_marked: boolean`). Before that flag is set, render the large help panel. After, render the compact corner button.

**1B · Language and wording review**  
Audit every label, button, tooltip, and error message in the app. Replace any developer-language with what a lecturer would naturally say. Key areas to check:
- The folder/file picker labels
- The memo selection step (many users don't know what "memo" means in the software sense — they call it the "answer key" or "marking guide")
- Strictness slider labels
- Error messages (currently likely raw API errors or generic fallbacks)
- The batch vs instant mode toggle

**1C · File picker system replacement**  
The current File System Access API picker only works in Chrome and Edge. Safari, Firefox, and mobile users hit a dead end. The replacement needs to work everywhere.

Options:
- **Standard `<input type="file" multiple>` with a drag-and-drop zone** — works in all browsers, no permissions required, user selects a batch of files at once (not a folder). Simplest fix.
- **Folder upload via `<input webkitdirectory>`** — works in Chrome, Firefox, Safari (modern). Lets the user select an entire folder. Closer to current behaviour.
- **Cloud upload to R2** — papers are uploaded to Cloudflare R2, processed server-side. Removes the browser entirely from PDF handling. Bigger build but unlocks mobile and multi-device access. More appropriate for Phase 3.

Recommended for Phase 1: `webkitdirectory` input with drag-and-drop fallback. It covers 95%+ of desktop browsers and requires no backend changes.

---

### Phase 2 — Paygate & Billing
*Goal: money in, plans enforced, trials working, zero manual intervention*

**2A · Usage metering (prerequisite)**  
Before any payment can be enforced, spend must be tracked. Supabase tables:

```
usage_events: id, user_id, model, input_tokens, output_tokens, cost_zar, created_at
user_plans:   user_id, plan, api_budget_zar, used_zar, cycle_start, cycle_end, active
```

Every call to `/api/mark` decrements `used_zar`. The `/api/mark` route checks allowance before calling Anthropic — if the user is over budget, the request is blocked with a clear message.

**2B · Free trial (explicit grant, not automatic)**  
New users start at **R0 allowance, blocked** — a fresh account cannot mark anything until it has a real plan or trial. This is enforced (see §7 — the `plan='none'` bypass bug was fixed 2026-06-12).

A trial is granted explicitly via `set_plan(user, 'trial')`, which sets:
- `plan = 'trial'`
- `allowance_cap_zar = 50` (R50 — enough to mark ~70 papers on Standard)
- `period_end = now() + 7 days`

No credit card required. When the trial expires (7 days) or the R50 budget runs out, the user is blocked and sees an upgrade prompt. A self-serve "Start free trial" button (so users can claim it without manual grant) is the remaining piece to build.

**2C · Payment gateway integration (PayFast)**  
PayFast is the best fit for ZAR subscriptions in SA — supports recurring payments, instant EFT, credit cards, and has a straightforward webhook API.

Flow:
1. User clicks "Upgrade" → redirect to PayFast checkout with the plan details
2. PayFast processes payment → fires a webhook to `/api/webhooks/payfast`
3. Webhook handler verifies the PayFast signature, then sets `user_plans.active = true`, `cycle_start = now`, `cycle_end = now + 30 days`, `api_budget_zar = plan_limit`
4. User is redirected back to the app with their plan active

For recurring billing: PayFast's subscription API handles the monthly charge automatically. The webhook fires each renewal, resetting `used_zar = 0` and extending `cycle_end`.

**2D · Plan enforcement and cutoff**  
Two cutoff conditions, both enforced server-side in `/api/mark`:
1. **Token budget exhausted** — `used_zar >= api_budget_zar` → block with "You've used your full allowance. Upgrade or wait for renewal."
2. **Plan expired** — `cycle_end < now` → block with "Your plan expired on [date]. Renew to continue."

UI shows allowance as a percentage bar, never as rand amounts.

**2E · Revenue tracking in the database**  
Every PayFast webhook that confirms a payment inserts a row into a `payments` table:
```
payments: id, user_id, plan, amount_zar, payfast_payment_id, created_at
```
This gives a simple revenue ledger: total revenue = `SUM(amount_zar)`. Can be queried from a simple admin view or the Bernard & Co. dashboard later.

---

### Phase 3 — PDF Capacity Audit & Scale-Up
*Goal: know the real ceiling, then raise it*

**3A · Capacity baseline measurement**  
Before building anything, measure what the current setup can actually handle:
- How many concurrent users can hit `/api/mark` before Anthropic rate-limits kick in?
- What is the largest PDF (pages × file size) that processes without the browser running out of memory?
- What is the Cloudflare Worker CPU time for a typical marking request? (Approaches the 50ms free / 30s paid wall?)
- What is the Supabase free tier row limit / connection pool limit?

Run these tests before writing a single line of infrastructure code.

**3B · Identified bottlenecks and fixes**  
Based on known architecture, the likely bottlenecks in order of severity:

| Bottleneck | Cause | Fix |
|---|---|---|
| Anthropic rate limits | Too many concurrent requests from one account | Cloudflare Queues: queue jobs, consumer throttles to stay under RPM limit |
| Browser memory | Large PDFs rendered client-side (pdfjs) | Chunk processing: render one page at a time, don't hold all pages in memory |
| Cloudflare Worker CPU | Heavy per-request processing | Move PDF extraction to background job (Durable Object or Queue consumer) |
| Supabase connections | Each Worker request opens a new DB connection | Use Supabase connection pooling (PgBouncer, already available on Supabase) |

**3C · Cloudflare Queues implementation**  
The biggest capacity lever. Instead of `/api/mark` calling Anthropic synchronously:

```
Browser → POST /api/mark → push job to Cloudflare Queue → return job_id
Queue consumer Worker → pull job → call Anthropic → write result to Supabase
Browser → polls Supabase for job status using job_id
```

This decouples throughput from concurrency. 100 papers submitted at once don't hit Anthropic 100 times simultaneously — they queue up and go through at a controlled rate. Browser doesn't need to stay open — job runs server-side.

---

### Phase 4 — Error Handling
*Goal: the app degrades gracefully instead of silently failing*

**4A · Anthropic rate limit hits (429)**  
Current behaviour: the API call fails, the user sees a generic error (or nothing).  
New behaviour: catch 429, wait with exponential backoff (1 s, 2 s, 4 s), retry up to 3 times. If all retries fail, queue the job for retry in 60 seconds and tell the user: "We're experiencing high demand — your papers are queued and will process shortly."

**4B · Anthropic service outage**  
Current behaviour: unknown — likely a 500 or timeout.  
New behaviour: catch 5xx responses from Anthropic. Mark the job as `status = 'failed'`, notify the user by email ("AutoMark is temporarily unavailable — we'll retry automatically when the service recovers"). Implement a health-check cron that pings Anthropic every 5 minutes and auto-retries failed jobs when the service is back.

**4C · Worker crash / timeout**  
Current behaviour: request dies silently.  
New behaviour: Cloudflare Workers have built-in error logging. Enable Logpush to capture all Worker errors. Add a dead-letter queue — jobs that fail 3 times are moved to DLQ and an alert is sent to `bernardmanne3@gmail.com`.

**4D · User hits plan limit mid-batch**  
Current behaviour: not built — no metering.  
New behaviour (after Phase 2): when a batch job is running and the user's allowance runs out mid-way, stop processing remaining papers, mark the job as `partially_completed`, and return the papers that did get marked. Show a clear message: "23 of 30 papers marked — you've used your full allowance. Upgrade to mark the remaining 7."

**4E · PDF parsing failures**  
Some PDFs are corrupt, password-protected, or in an unsupported format.  
New behaviour: validate PDFs before submitting to the queue. Reject with a specific error: "paper_name.pdf could not be read — it may be password-protected or corrupted." Continue processing the rest of the batch.

**4F · Error visibility for the founder**  
A simple admin endpoint (protected, only accessible to your account) that shows:
- Failed jobs in the last 24 hours
- Current Anthropic error rate
- Active user count
- Total usage today

No external tool needed initially — a protected Next.js page that queries Supabase directly.

---

### Phase 5 — Image Handling & Best Practices
*Goal: handle scanned/image-based papers, and teach users how to get the best results*

**5A · Image paper detection and handling**  
Currently: pages without a text layer fall back to rendering as a PNG and sending the image to Claude. This works but is expensive (vision tokens cost more) and mark placement is less accurate.

Improvements:
- **Smarter fallback detection** — check text layer quality (character count, confidence). Some PDFs have a text layer from OCR but it's garbage — detect this and fall back to image.
- **Tesseract OCR layer** — before sending an image page to Claude, run Tesseract over it. If confidence > 70%, pass the extracted text instead of the image. Cuts vision token costs significantly for clean scans.
- **Image quality preprocessing** — before sending to Claude, resize and compress PNG renders to the minimum resolution that preserves readability (800–1200px width). Currently likely sending full-resolution renders unnecessarily.

**5B · Best practices guide (in-app)**  
A dedicated "Getting the best results" page, accessible from the help corner button. Content:

- **Paper format tips** — typed papers work best; scanned papers work but cost more allowance; handwritten papers are not supported
- **Memo tips** — the more specific the memo, the more accurate the marking; include worked examples for calculation questions; specify partial mark criteria explicitly
- **Strictness guide** — explain what each level actually does (1 = very lenient, allows paraphrasing; 10 = exact match only). Show examples.
- **Batch vs Instant** — when to use each (batch for cost savings on large sets, instant when you need results now)
- **File naming** — consistent naming helps (student number in filename makes results easier to sort)
- **Common issues** — what to do if marks look wrong, how to re-run with a stricter memo, how to check allowance

This page converts confused users into confident power users and reduces support load.

---

## 4. Technology Decisions — Preferred Stack

| Need | Recommended | Why |
|---|---|---|
| File picker (Phase 1) | `webkitdirectory` + drag-and-drop | Cross-browser, no backend changes needed |
| Payment gateway (Phase 2) | PayFast | SA-native, ZAR recurring billing, clean webhook API |
| Job queue (Phase 3) | Cloudflare Queues | Native to the stack, cheap, integrates with Workers |
| Email / notifications (Phase 4) | Resend | Free tier generous, SA delivery solid |
| Error tracking (Phase 4) | Sentry (free tier) | Industry standard, Next.js SDK works |
| OCR (Phase 5) | Tesseract.js (browser-side) | No new service, runs where the PDFs already are |
| Cloud storage (future) | Cloudflare R2 | No egress fees, S3-compatible, free 10 GB |

---

## 5. Rough Cost Projections

All costs in ZAR. Cloudflare Workers Paid plan is ~R280/month and handles most infrastructure needs.

| Customer count | Monthly revenue | Est. infra cost | Net margin |
|---|---|---|---|
| 10 customers (mixed) | R15,000 | R1,200 | R13,800 |
| 50 customers | R75,000 | R4,500 | R70,500 |
| 100 customers | R150,000 | R8,000 | R142,000 |
| 200 customers | R300,000 | R15,000 | R285,000 |

*Infra: Cloudflare Workers Paid, Supabase Pro (~R350/mo at 100 users), Resend, Sentry free, PayFast 2.5% transaction fees.*  
*Revenue assumes ~60% Standard (R1,000), ~40% Pro (R3,000).*

---

## 6. Build Order

```
PHASE 1 — UI/UX (do first, sets the quality bar):
  ├── Help button (large → corner after first mark)
  ├── Wording audit across all labels and errors
  └── File picker: webkitdirectory + drag-and-drop

PHASE 2 — Paygate (enables real revenue):
  ├── Usage metering tables + API gate
  ├── Free trial (7 days / R50, explicit grant — new users start at R0)
  ├── PayFast integration + webhook handler
  ├── Plan enforcement (token + time cutoffs)
  └── Payments table (revenue ledger)

PHASE 3 — Capacity (know the ceiling before hitting it):
  ├── Baseline load test (concurrent users, PDF sizes, Worker CPU)
  ├── Fix browser memory chunking for large PDFs
  ├── Cloudflare Queues (decouple throughput from concurrency)
  └── Supabase connection pooling

PHASE 4 — Error handling (stop failing silently):
  ├── Retry with backoff on 429s
  ├── Anthropic outage detection + job requeue
  ├── Mid-batch allowance enforcement
  ├── PDF validation before queue entry
  └── Admin error dashboard (protected Next.js page)

PHASE 5 — Image & best practices:
  ├── Tesseract OCR layer for scanned pages
  ├── PNG compression before Claude vision
  └── Best practices in-app page
```

---

## 7. Open Questions

1. **PayFast vs Ozow for Phase 2** — PayFast is more complete for subscriptions; Ozow is EFT-native. University finance departments might prefer EFT. Decide before building Phase 2C.

2. **Free trial budget amount** — set to R50 / 7 days. That buys ~70 papers on Standard. Enough to feel the value without being exploitable? Revisit once real trial users come through.

3. **`webkitdirectory` vs drag-and-drop only for Phase 1** — `webkitdirectory` lets users select a folder (matching current mental model); drag-and-drop lets them grab files from anywhere. Do both, or just one?

4. **Tesseract in browser vs Worker (Phase 5)** — browser Tesseract avoids Worker CPU limits but adds client-side weight; Worker Tesseract is cleaner but may hit the 30s CPU wall on large pages. Decide when building Phase 5A.

5. **Admin dashboard scope (Phase 4F)** — should this roll into the Bernard & Co. CEO dashboard, or stay as a standalone protected page in the AutoMark app itself?
