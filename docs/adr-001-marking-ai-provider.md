# ADR-001: AI provider & input strategy for marking

**Status:** Proposed
**Date:** 2026-05-26
**Deciders:** Michael (owner)
**Related:** `docs/cost-and-pricing-notes.md`

## Context

AutoMark stamps marks onto student test papers. The marking engine is the only
paid/variable-cost part of the app — rendering and stamping are already free
(client-side). Two coupled choices drive cost, quality, and the business model:

1. **Which AI provider** runs the marking (Claude / Gemini / local Ollama).
2. **What we send it** — page **images** (vision) vs extracted **text** (OCR-then-reason).

Forces at play:
- **Inputs are mostly handwritten scans** → no text layer → vision or OCR required.
- **POPIA**: papers contain student PII; free cloud tiers may train on data.
- **Cost**: image tokens ≈ 10× text tokens; a flat-fee "we pay" tier risks losing money
  on heavy users.
- **Trust**: marking accuracy is the whole product. A wrong mark erodes trust fast.
- **Business model** (from pricing notes): ~R200 "bring your own AI" tier, ~R1000
  "done-for-you" tier.

Constraint: we want to **launch on one engine soon**, without painting ourselves into a
corner on the others.

## Decision

**Build a thin provider abstraction (a `MarkingProvider` interface), launch with
Claude vision as the default "done-for-you" engine, and slot in Gemini (cheap/BYO) and
Ollama (local/private) behind the same interface.** Treat **OCR-then-reason** as a
**cost optimization for phase 2**, not a launch dependency.

In short: **quality-first at launch (Claude vision), pluggable for cost & privacy later.**

## Options Considered

### Option A: Single provider — Claude vision only
| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — already half-built |
| Cost | High (image tokens, we pay) |
| Quality | Highest — best handwriting + judgment |
| Privacy | Good (paid tier, no training) |
| Team familiarity | High (SDK already wired) |

**Pros:** Fastest to ship; best marking accuracy; already integrated.
**Cons:** Highest per-paper cost; single vendor; no free/local path for price-sensitive
or privacy-strict users.

### Option B: Multi-provider switch (Claude + Gemini + Ollama) behind one interface
| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — one interface, 2–3 adapters |
| Cost | Flexible — match provider to tier |
| Quality | Varies by provider |
| Privacy | Best option available (Ollama = on-device) |
| Team familiarity | Medium |

**Pros:** Directly enables the R200 (BYO/Ollama) and R1000 (Claude) tiers; vendor
flexibility; privacy story via local; testable for free via Gemini.
**Cons:** More surface to build/maintain; quality varies; Ollama needs the browser→
localhost call + `OLLAMA_ORIGINS` setup.

### Option C: OCR-then-reason hybrid (cheap OCR → cheaper reasoning model)
| Dimension | Assessment |
|-----------|------------|
| Complexity | High — OCR + box mapping + reasoning + stamp alignment |
| Cost | Lowest per paper (text tokens, not image) |
| Quality | Depends on OCR; risky on messy handwriting |
| Privacy | Good if OCR is local (Tesseract) |
| Team familiarity | Low |

**Pros:** Cheapest at scale; OCR bounding boxes give accurate mark placement; can run
OCR locally for privacy.
**Cons:** Handwriting OCR is unreliable → can silently lower marking accuracy; most
complex to build; highest risk to trust if shipped first.

## Trade-off Analysis

- **Quality vs cost:** Vision (A) maximises accuracy but costs the most; OCR (C) is
  cheapest but stakes the product's credibility on OCR reading handwriting correctly.
  For a marking tool, **accuracy must win at launch** — a cheap wrong mark is worse than
  an expensive right one.
- **Lock-in vs speed:** Going pure single-provider (A) is fastest but boxes us in. A thin
  interface (B) costs a little upfront and unlocks every pricing tier and the privacy
  story. The marginal effort is small because rendering/stamping/file IO are already
  client-side and provider-agnostic.
- **Placement accuracy:** This is the sleeper issue. Vision models guess coordinates
  poorly; OCR boxes are precise. So even if reasoning stays on Claude, **OCR may be worth
  adopting later purely for *where* to stamp**, independent of cost.
- **Privacy:** Only Ollama keeps PII fully on-device. For POPIA-strict schools that's a
  selling point, so it belongs in the roadmap even if not at launch.

## Consequences

**Easier:**
- Ship marking quickly on the strongest engine (Claude vision).
- Add Gemini (free-tier testing / BYO) and Ollama (local/private) without rework.
- Pricing tiers map cleanly onto providers.

**Harder / to revisit:**
- Maintaining 2–3 provider adapters and their quirks (auth, image formats, CORS for
  Ollama).
- Per-paper cost on the Claude tier stays high until OCR-then-reason lands → the R1000
  tier **needs a usage cap or metering from day one** (see pricing notes).
- Mark-placement accuracy on Claude vision remains approximate until OCR boxes are added.

**To revisit later:**
- Whether to switch the *reasoning* model from Opus-class to Sonnet-class for cost
  (test marking-quality parity).
- Adopt OCR for **placement** even on the Claude tier once stamping precision matters.

## Recommendation

1. **Launch:** Claude vision, default engine, behind a `MarkingProvider` interface.
   Consider Sonnet-class as the default model and reserve Opus-class for a "high accuracy"
   toggle — verify quality parity before committing.
2. **Protect margin:** ship the R1000 tier with a **paper/page allowance + metering**
   (non-negotiable given image-token cost).
3. **Next:** add **Gemini** adapter (free tier for testing + BYO-key R200 tier).
4. **Then:** add **Ollama** adapter for the local/private option.
5. **Later / cost + placement:** add **OCR-then-reason** (local Tesseract for boxes →
   Claude reasons on text → stamp at boxes).

## Action Items

1. [ ] Define `MarkingProvider` interface (`markPaper(pages, memo, markTypes, strictness) → annotations + score`).
2. [ ] Refactor current `/api/mark` Claude call to be the first adapter behind it.
3. [ ] Decide default model (Sonnet vs Opus) — run a small marking-quality comparison.
4. [ ] Add usage metering / monthly allowance before opening the paid tier.
5. [ ] Add Gemini adapter (free-tier + BYO key).
6. [ ] Add Ollama adapter (browser→localhost, document `OLLAMA_ORIGINS`).
7. [ ] Prototype OCR-then-reason (Tesseract boxes) and compare cost + placement accuracy.
