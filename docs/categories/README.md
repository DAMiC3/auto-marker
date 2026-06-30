# AutoMark — System Categories

The whole product is split into **7 categories**. Each has its own deep-dive doc in this folder. This index is the map; the numbered files are the territory.

| # | Category | Covers | Doc | Detail status |
|---|----------|--------|-----|---------------|
| 1 | **Payments & Enforcement** | Plans, allowances, metering, billing, cutoffs, the payment flow | [01-payments-and-enforcement.md](01-payments-and-enforcement.md) | ✅ Fully documented |
| 2 | **Marking & PDFs** | PDF ingestion, text/image extraction, the marking pipeline, stamping output | [02-marking-and-pdfs.md](02-marking-and-pdfs.md) | ✅ Fully documented |
| 3 | **UI** | All front-end surfaces, components, settings, **and notifications/comms** | [03-ui.md](03-ui.md) | ✅ Fully documented |
| 4 | **Error Handling** | Failure modes, retries, fallbacks, **and observability/monitoring** | [04-error-handling.md](04-error-handling.md) | ✅ Fully documented |
| 5 | **AI** | Models, prompts, provider strategy, accuracy, cost levers | [05-ai.md](05-ai.md) | ✅ Fully documented |
| 6 | **DB & Hosting** | Supabase schema, RLS, Cloudflare Workers, deploy, secrets | [06-db-and-hosting.md](06-db-and-hosting.md) | ✅ Fully documented |
| 7 | **Auth & Onboarding** | Sign-up, sign-in, sessions, first-run, self-serve trial activation | [07-auth-and-onboarding.md](07-auth-and-onboarding.md) | ✅ Fully documented |

## Category boundaries (where things were folded in)

- **Notifications** (batch-complete emails, trial-expiry warnings, renewal confirmations) live under **UI** — they are user-facing communication.
- **Observability** (logs, error tracking, admin dashboards, usage trends) lives under **Error Handling** — you can't handle what you can't see.

## Problems backlog

Every category doc ends with a **Problems / To-Fix Backlog** table (severity-tagged, stable IDs like `P1-1`). Tackle them when you work that section. The 🔴 high-severity items — fix before real paying customers — across all categories:

| ID | Category | Problem |
|----|----------|---------|
| ~~P1-1 / P6-1~~ | ✅ Payments / DB | ~~Duplicate revenue triggers → double-logs first paid customer~~ — **FIXED 2026-06-15** (dropped `log_plan_revenue`) |
| ~~P6-2~~ | ✅ DB | ~~Trigger functions publicly callable via REST (`anon`/`authenticated`) — Supabase advisor~~ — **FIXED 2026-06-29** (revoked EXECUTE from `public`/`anon`/`authenticated` on `log_revenue_event`) |
| ~~P2-1~~ | ✅ Marking | ~~Re-running a batch silently overwrites marked files (original already deleted) → data loss~~ — **FIXED 2026-06-15** (empty-destination guard + versioned writes + keep-originals setting) |
| ~~P3-1~~ | ✅ UI | ~~Mark types can be deleted to zero → prompt has no shapes to mark with~~ — **FIXED 2026-06-15** (≥1 guard in `removeMark` + disabled remove button on last type) |
| ~~P4-1 / P7-5~~ | ✅ Errors / Auth | ~~Middleware has no try/catch around `getUser()` → auth outage breaks all pages~~ — **FIXED 2026-06-27** (wrapped + fail closed to `/login`) |
| ~~P5-1~~ | ✅ AI | ~~Prompt injection — student answers inserted raw ("award full marks")~~ — **FIXED 2026-06-29 (lean)**: student text fenced + "to be marked only" prompt rule; forgery attempts quarantined to "Problematic papers" before any model call |
| ~~P7-1~~ | ✅ Auth | ~~First-run dead-ends at R0/blocked with no self-serve path~~ — **FIXED 2026-06-29** (self-serve "Start free trial" → `/api/trial/start` → `set_plan(user,'trial')`) |
| ~~P7-2 / P3-2~~ | ✅ Auth / UI | ~~No password-reset flow~~ — **FIXED 2026-06-16** (forgot-password on login + `/reset-password` page via `resetPasswordForEmail`) |

Severity legend: 🔴 fix before real paying customers · 🟠 important · 🟡 minor/polish · 🔵 not-built/roadmap.

## How to use these docs

Each category doc is the single source of truth for that slice of the system. When you change code in a category, update its doc in the same pass. `AGENTS.md` (auto-loaded every session) points here so any Claude Code session can find them. **When you fix a backlog item, delete its row (or mark it ✅) in that category's Problems table and here.**

> Sibling docs worth knowing: [`../HANDOVER.md`](../HANDOVER.md) (full system state), [`../adr-002-pricing-and-plans.md`](../adr-002-pricing-and-plans.md) (pricing decision), [`../expansion-plan.md`](../expansion-plan.md) (the 5-phase growth roadmap).
