# AutoMark — Risk Register

**Created:** 2026-07-18 · **Purpose:** a single place to review known risks, what's been closed, and what's still open. Consolidates the analysis done across categories — see the linked category docs for depth. Severity: 🔴 address before scaling / real money · 🟠 important · 🟡 minor/polish · 🟢 handled.

> **The overall shape:** the app is engineered so the **user is protected** (never charged for unfinished/failed work, data never corrupted). When costs land, they land on **you** (revenue ceilings, an outage you can't see, small write-offs, compliance). The app is **spend-bound, not compute-bound**.

---

## 1. Scaling ceilings — what breaks at what size

Baselined on Anthropic **Start** tier + Supabase **Free** tier (2026-07-18). Also rendered on the Bernard & Co. dashboard **Vitals → Expansion Plan**.

| Ceiling | Limit today | Reaches it at | Sev | Fix (cost) |
|---|---|---|---|---|
| **Anthropic monthly spend cap** | $500/mo (~R9,250) Start | **~30 maxed Standard users → all marking pauses org-wide** | 🔴 | Raise cap / tier up in Console — *settings, no code; uncaps real spend* |
| **Supabase Free compute** | 1 shared vCPU, 0.5 GB | Dozens of concurrent users → allowance checks time out → marking blocked | 🔴 | Supabase Pro **~$25/mo (~R460)** + scalable compute |
| **Cloudflare Worker memory** | 128 MB (fixed, all plans) | ~10–25 *scanned* papers in one batch (typed: never) | 🟠 | **Not upgradeable** — byte-aware batch chunking or Anthropic Files API (code) |
| Anthropic per-minute rate | 1,000 RPM · 2M ITPM · 400k OTPM | ~400–1,000 papers/min aggregate | 🟢 | Far off |
| Batch size | app 100 · Anthropic 100,000 | 101 PDFs (now auto-chunked, see §5) | 🟢 | Handled |
| Supabase DB size / MAU | 500 MB · 50,000 MAU | ~2.5M usage rows / 50k users | 🟢 | Pro raises both |

**Trigger to act:** raise the Anthropic cap **and** move to Supabase Pro together **before ~user 25**.

---

## 2. Outage behaviour — what happens when infra fails

See `categories/04-error-handling.md` for the full catalogue.

| Failure | User sees | App does | Money/data | You find out? |
|---|---|---|---|---|
| **Anthropic API down** | "try again in a moment" | SDK retries 4× → 500 | Nothing charged/lost | ✅ push alert |
| **Supabase down** | "couldn't verify your plan… weren't charged" / bounced to login | Fail-closed gate; usage writes park in D1 → replay | Safe but unavailable; deferred billing not lost | ✅ push alert |
| **Cloudflare hosting down** | site unreachable | nothing (the app *is* what's down) | data intact | ⚠️ **NO — blind spot (see §4)** |
| **Prod misconfig** (metering) | 🟢 now blocks + alerts (was: silent free marking) | Fail-closed in prod (2026-07-18) | — | ✅ push alert |

---

## 3. Product & compliance risks (not infrastructure)

| Risk | Sev | For the user | For you |
|---|---|---|---|
| **Marking accuracy / hallucination** | 🔴 | Wrong grades if returned unreviewed → student disputes | Trust/reputation/liability. Needs a clear "AI-marked — **review before returning**" stance + spot-check QA |
| **Legal: Terms, Privacy Policy, Refund policy** | 🔴 (once paid) | — | Mandatory the moment money + student data flow |
| **POPIA / student data → Anthropic (US)** | 🟠 | Their students' answers leave the country | Cross-border transfer needs a stated basis (Anthropic doesn't train on API data — helps). PDFs stay client-side (good); extracted *text* is sent |
| **No automated tests / CI** | 🟠 | — | Everything rides on manual verification; a *payments* product especially needs regression tests |
| **Chrome/Edge only** | 🟡 | Firefox/Safari/mobile can't use it at all | Signup ceiling |

---

## 4. Security & operational

| Risk | Sev | Notes |
|---|---|---|
| **Cloudflare hosting outage is invisible to you** | 🔴 | All alerts run *inside* the Worker, so a full hosting outage can't page you. **Fix: external monitor** (UptimeRobot, free) → `GET /api/health` (endpoint added 2026-07-18). Off-Cloudflare so it catches even a full region outage. *Owner action: wire the monitor.* |
| **Password reuse ("overusing one password")** | 🔴 | One breach = credential-stuffing across all accounts. Your one email guards GitHub (code), Cloudflare (hosting/deploy/DNS), Supabase (all data + service key), Anthropic (API key = money); Gmail is the recovery root. **Fix: MFA everywhere (Gmail first) + a password manager (unique per service).** |
| **Weak/reused secret `Maakoop1`** | 🟠 | Used as `CRON_SECRET` and was the old `AUTH_SECRET`. **Rotate to a random per-role secret** (touches both workers + AutoMark env). |
| **You = single point of failure** | 🟠 | Manual plan activation (SQL + WhatsApp), single ops person. A paygate (§5) removes the activation bottleneck. |
| **Single Anthropic account/key** | 🟠 | Suspension, billing failure, or key leak → *all* users down. MFA the account; monitor spend. |
| **Two tabs → allowance overshoot** | 🟡 | Single-flight lock is per-tab; bounded to ≤1 request/tab of overspend. |
| **Batch latency + closed-tab loss (C11)** | 🟡 | Closing the tab mid-batch abandons ≤1 in-flight chunk — *you* pay Anthropic, user unaffected. `beforeunload` guard added 2026-07-18. Real fix = server-side batch tracking (roadmap). |
| **Observability depth** | 🟠 | Push-alerts only — no Sentry, Logpush, admin dashboard, or metrics; no cron drain of the D1 dead-letter buffer. |

---

## 5. New risk surface a paygate will introduce (for when it's built)

A paygate removes the manual-activation bottleneck but adds:
- **Webhook signature verification** (e.g. PayFast ITN) — unverified = anyone grants themselves a plan.
- **Idempotency** — duplicate webhooks must not double-credit (the dashboard keys on id; the AutoMark side needs the same).
- **Reconciliation** — charged but webhook failed → paid, no plan. Needs a poll/manual fallback.
- **Lifecycle** — refunds, chargebacks, failed/partial payments, renewals, cancellations, upgrade proration.
- **Sandbox testing** before going live; VAT/invoicing if registered.

See the pay-gate spec in `HANDOFF.md` (bernard-dashboard) for the required `revenue_events` insert + sync webhook.

---

## 6. Closed this session (2026-07-18)

- ✅ **Moodle round-trip:** recursive + zip ingestion (`lib/collectDocs.ts`); marked output re-zipped in the same shape (`lib/markedZip.ts`). See `categories/02-marking-and-pdfs.md` §6.2b.
- ✅ **Batch >100 PDFs** now auto-chunks by `min(100, affordable)` — same procedure as an allowance overflow, respects both the 100 ceiling and the budget. See `categories/01-payments-and-enforcement.md` (2026-07-18 update).
- ✅ **`beforeunload` guard** while marking (mitigates C11).
- ✅ **`GET /api/health`** liveness endpoint for an external monitor.
- ✅ **Prod misconfig → fail closed + alert** (`checkAllowance`).
- ✅ **Instant per-paper isolation** confirmed already present (P2-3); stale doc corrected.
- ✅ **Verified:** batch works and bills at 50% (live probe); prompt caching works sequentially (~90% cheaper prefix), best-effort in batch; production stress test 5,000 req / 0 errors / 731 rps; count+budget chunking proven against the real guardrail functions.

---

## 7. Suggested order of attack (next reviews)

1. **Wire UptimeRobot** → `/api/health` (closes the only invisible outage). *Owner, 2 min.*
2. **Raise Anthropic cap + Supabase Pro** before ~user 25.
3. **MFA everywhere + rotate `Maakoop1`.**
4. **Automated tests / CI** before the paygate lands.
5. **Legal docs** (ToS, Privacy, Refunds) + an **"AI-marked, review before returning"** accuracy stance.
6. Then: paygate (§5), server-side batch tracking (C11), deeper observability.
