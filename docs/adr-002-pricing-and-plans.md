# ADR-002: Pricing & plan model

**Status:** Accepted
**Date:** 2026-05-26
**Deciders:** Michael (owner)
**Related:** ADR-001, `docs/cost-and-pricing-notes.md`

## Context

Marking is the only variable-cost part of the app. Pricing must protect margin
without complexity. Market: individual university lecturers in South Africa; inputs are
**typed** tests (text extraction, not vision/OCR). The owner's explicit priority for this
decision is **simplicity** — no clever billing machinery.

## Decision

**Two flat monthly plans with a cost-based usage allowance shown only as a percentage.
When a plan's allowance is used up — or the month ends — the user simply buys another
plan to get a fresh month's allowance. Nothing else.**

Explicitly **rejected** (to keep it simple): top-ups, rollover of unused allowance,
discounts / intro offers, and seasonal or surge pricing.

### Plans

| Plan | Price/month | Usage cap (API cost) | Margin |
|------|------------|----------------------|--------|
| **Standard** | R1000 | R300 | **R700 (70%)** |
| **Pro** | R3000 | R1500 (5× Standard) | **R1500 (50%)** |

### Mechanics

- **Allowance is measured in Rand of API cost** but **displayed only as a percentage**
  used / remaining — never Rand, never tokens. This hides costs/margins and lets us swap
  models or renegotiate rates without changing the UI.
- **Both Opus and Sonnet** draw from the same cost allowance. **Opus burns it ~5× faster**
  and is labelled "high-accuracy."
- **No rollover** — unused allowance expires at month end.
- **No top-ups** — to get more, **buy another plan (renew)**, which grants a fresh full
  allowance for another month.
- **No discounts, promos, or surge pricing** — the price is constant year-round.
- **Exam-season spikes** are handled by simply **re-buying a plan**, not by changing price.

### Capacity (typed papers, estimates)

Per-paper cost ≈ Sonnet R0.69 · Opus R3.50.

| Plan | Sonnet papers/mo | Opus papers/mo |
|------|------------------|----------------|
| Standard (R300) | ~435 | ~86 |
| Pro (R1500) | ~2,175 | ~429 |

On **Sonnet**, the Pro plan covers a normal multi-module lecturer's exam season. On
**Opus** (premium), very large cohorts may exhaust a plan → the user renews.

## Consequences

**Easier:**
- Dead-simple to explain and to build (no top-up/rollover/promo logic).
- The cap **guarantees no loss** — price always exceeds the cost cap, so a heavy user can
  never cost more than their plan.
- Heavy users **renew more often** → revenue scales with usage automatically.

**Harder / to revisit:**
- Requires **per-user accounts + usage metering** (track real API cost per mark, decrement
  the allowance, reset monthly) → needs a backend/DB (Supabase). This is the prerequisite
  for charging at all.
- The Pro plan's realised margin will sit toward 50% for heavy users (selection bias) — no
  longer "banking on breakage," since renewal (not a fat unused allowance) absorbs spikes.
- Revisit cap sizes and the 5× ratio after launch once real usage is known (the %-only
  display makes retuning the underlying caps invisible to users).

## Action Items

1. [ ] Per-user account + usage metering (cost per mark → decrement allowance).
2. [ ] Percentage-only allowance display (never Rand/tokens).
3. [ ] Monthly reset; "allowance used → buy another plan" renewal flow.
4. [ ] Label Opus as "high-accuracy (uses allowance faster)."
5. [ ] Revisit cap sizes / 5× ratio after launch.
