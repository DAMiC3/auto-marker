---
description: Navigate a crossroad — uses /btw style to ask 1-4 questions, then produces a comparison table + ADR
---

The user is at a decision crossroad: $ARGUMENTS

## Phase 1 — understand (use /btw style)

Use /btw's casual, direct tone. Ask 1–4 focused questions in one message to get:
- What the concrete options are (if not stated)
- Hard constraints (stack pins in AGENTS.md, budget, timeline)
- What the user cares about most (speed, cost, simplicity, scalability)
- Relevant prior decisions (check docs/adr-*.md)

Wait for answers. This can span multiple turns — do not rush to a conclusion.

## Phase 2 — decide and document (after user answers)

Produce in order:
1. **Comparison table** — options as columns, criteria as rows, winner highlighted
2. **Recommendation** — one paragraph: what to pick and why, naming the main trade-off
3. **ADR file** — write to `docs/adr-NNN-<slug>.md`

ADR number: read existing `docs/adr-*.md` files, find the highest number, increment by 1.
Follow the format in `docs/adr-001-marking-ai-provider.md` (Title, Date, Status: Accepted, Context, Decision, Consequences).
