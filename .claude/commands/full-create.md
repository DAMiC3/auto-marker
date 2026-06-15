---
description: Full build pipeline in one command — plan → develop → decision at crossroads → develop → explain → reflect
---

Run the complete build pipeline for: $ARGUMENTS

Drive this end-to-end. Move through the stages automatically; only stop to talk to the user at the two points marked **PAUSE**.

## Stage 1 — PLAN (follow .claude/commands/plan.md)
Read git state + relevant files + HANDOVER + AGENTS.md. Ask any blocking questions, then write the plan to `docs/plans/<slug>.md`.
**PAUSE** — show the plan and get the user's go-ahead before building. Do not start coding until they approve.

## Stage 2 — DEVELOP (follow .claude/commands/develop.md)
Implement the plan in order, respecting all AGENTS.md stack pins. Keep going without stopping for things the plan already decided.

## Stage 3 — DECISION at a crossroad (follow .claude/commands/decision.md)
If you hit a real fork the plan didn't settle (a genuine trade-off, not a detail you can reasonably pick yourself):
- **PAUSE** — run the decision flow: ask 1-4 btw-style questions, present a comparison table + recommendation, write the ADR.
- Once the user picks, **return to Stage 2 automatically** and keep building.
Loop Stage 2 ↔ Stage 3 as many times as needed until the build is finished. Trivial choices you should just make yourself — don't manufacture crossroads.

## Stage 4 — verify
When the build is complete, run `npx tsc --noEmit` (and any obvious test/build check). Mark the plan doc `Built`.

## Stage 5 — EXPLAIN (follow .claude/commands/explain.md)
Give the detailed walkthrough: what changed per file, why, how it works, gotchas, how to verify.

## Stage 6 — REFLECT (follow .claude/commands/reflect.md)
Reflect on the build — what went right, what went wrong, how to do better — and append the dated entry to `docs/reflections.md`.

## Summary of control flow
PLAN → [PAUSE: approve] → DEVELOP ⇄ DECISION (loop until done) → VERIFY → EXPLAIN → REFLECT
The only mandatory stops are the plan approval and any real crossroad. Everything else flows automatically.
