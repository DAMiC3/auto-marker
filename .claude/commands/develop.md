---
description: Build what was planned or decided — enter full implementation mode
---

The user wants to build: $ARGUMENTS

## What to build

If $ARGUMENTS names a specific plan or decision, find the corresponding doc in `docs/plans/` or `docs/adr-*.md` and use it as the spec.

If $ARGUMENTS is empty or vague, check `docs/plans/` for the most recent plan with status `Draft` or `Approved`, read it, and confirm with the user before starting.

## How to build it

1. Read the plan/ADR fully before touching any code
2. Implement each file change in the order listed in the plan
3. Follow all stack constraints in `AGENTS.md` (Next 15.5.18, Cloudflare edge, no runtime exports in middleware, etc.)
4. After implementation: run type checks if available (`npx tsc --noEmit`)
5. Update the plan doc status from `Draft` to `Built` and note what was done and what's still outstanding

Do not stop mid-implementation to ask about things the plan already decided. If you hit something the plan didn't cover and it would change the approach, pause and flag it explicitly.
