---
description: Plan a full piece of work — reads the codebase, asks blocking questions, produces a structured plan doc
---

The user wants to plan: $ARGUMENTS

## Step 1 — read current state

Before asking anything, read:
- `git status` and recent commits to understand what's in progress
- Relevant existing files (routes, components, API handlers, lib/ utilities) that this work touches
- `docs/HANDOVER.md` open items section for anything related
- `AGENTS.md` for stack constraints

## Step 2 — ask blocking questions (if needed)

Ask only questions that would change the plan if answered differently. Can be multiple rounds. Keep it direct.

## Step 3 — produce the plan

Write a plan document to `docs/plans/<slug>.md` with:

```
# Plan: <title>
Date: <today>
Status: Draft

## Scope
- In: ...
- Out: ...

## Files to touch (in order)
1. `path/to/file.ts` — what changes and why
2. ...

## Key decisions baked in
- ...

## Stack gotchas
- (Cloudflare edge limits, Next 15 constraints, Supabase RLS, etc.)

## Acceptance criteria
- [ ] ...
```

Do NOT start implementing. The plan must be approved before `/develop` is run.
