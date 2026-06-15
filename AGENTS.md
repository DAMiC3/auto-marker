# AutoMark — agent briefing

> **Read `docs/HANDOVER.md` for the full state.** This file is the tight version loaded automatically on every fresh agent session.

AutoMark is an AI marking app for **typed university test PDFs**. Lecturers upload student answers + a memo; Claude marks them; ticks/scores/comments are stamped onto the PDF and the marked file is moved to a destination folder. SA-priced subscription product (R1000 / R3000) with metered allowances.

## Stack pins — DO NOT bump without reading docs/HANDOVER.md

- **Next.js 15.5.18** — **NOT 16** (`@opennextjs/cloudflare` does not yet render Next 16 pages; we hit `TypeError: components.ComponentMod.handler is not a function`)
- React 19, Tailwind v4, TypeScript
- Supabase (auth + DB) — project `pdlkkfedovssaaecemkp`
- Anthropic Claude — `claude-sonnet-4-6` (Standard) / `claude-opus-4-7` (High accuracy)
- Cloudflare Workers via `@opennextjs/cloudflare`
- Middleware lives in **`middleware.ts`** (edge, no explicit runtime export). Do **not** use Next 16's `proxy.ts` — OpenNext only supports edge middleware.

## Hosting

| Piece | Host | URL |
|---|---|---|
| App | Cloudflare Workers | https://auto-marker.bernardmanne3.workers.dev |
| Landing site | GitHub Pages (separate repo `DAMiC3/automark-site`) | https://damic3.github.io/automark-site/ |
| DB / Auth | Supabase | project `pdlkkfedovssaaecemkp` |
| Old Netlify deploy | paused (free credits exhausted) — ignore |

## Deploy (manual, from local)

The repo isn't wired to Cloudflare Workers Builds yet, so deploys are manual via wrangler:

```bash
rm -rf .next .open-next
npm run build:cf
mv open-next.config.ts open-next.config.ts.bak
npx wrangler deploy
mv open-next.config.ts.bak open-next.config.ts
```

The hide-config dance is because OpenNext's own deploy command fails on Windows. Plain `wrangler deploy` uploads `.open-next/worker.js` cleanly.

> ⚠️ **`build:cf` fails randomly on Windows** — see the Defender gotcha below. If a build dies with a *different* error each run (`copyfile … pages-manifest.json` ENOENT, `Unexpected "*"` in `next-server.js`, `Unexpected end of JSON input`, etc.), it's file-scan contention, not your code. Just re-run; it usually passes within a few attempts. Add the Defender exclusion to make it reliable.

## Secrets / env (NEVER commit values)

Public vars live in `wrangler.jsonc` `vars`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Worker secrets (set via `npx wrangler secret put NAME`):
- `ANTHROPIC_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPS_ALERT_WEBHOOK_URL` (optional) — ops alerts on Supabase write failure (e.g. an `ntfy.sh` topic for phone push). Unset = log-only. See Category 1 §13b.

Bindings in `wrangler.jsonc`:
- `USAGE_DLQ` (Cloudflare D1) — dead-letter buffer for failed usage writes (Problem 8). Needs a one-time `wrangler d1 create` + pasting the `database_id`; see Category 1 §13b.

Local dev keys live in `.env.local` (gitignored).

## ⚠️ Gotcha — agent shells shadow ANTHROPIC_API_KEY

The Claude Code agent shell sets `ANTHROPIC_API_KEY=""` (empty). Next.js refuses to override an existing env var, so `.env.local`'s key is ignored when the dev server starts from this shell. Fix:

```bash
unset ANTHROPIC_API_KEY && npm run dev
```

End-user terminals don't have this problem.

## ⚠️ Gotcha — Windows Defender corrupts `build:cf` (random failures)

`npm run build:cf` writes thousands of files into `.next` / `.open-next`; Windows Defender's real-time scanning locks/scans them mid-write and the build reads a half-written file → it fails at a **different stage every run** (manifest copy ENOENT, esbuild `Unexpected "*"`, `Unexpected end of JSON input`, …). It's non-deterministic environment contention, **not a code bug** — blind re-running eventually passes (observed: ~1 in 5 runs).

**Durable fix** — exclude the project folder from Defender, once, in an **Administrator** PowerShell:

```powershell
Add-MpPreference -ExclusionPath "C:\Users\Michael Bernard\auto-marker"
```

Reverse later with `Remove-MpPreference -ExclusionPath "C:\Users\Michael Bernard\auto-marker"`. The Claude Code agent shell is **not elevated**, so an agent can't add this — it can only retry the build in a loop until one passes.

## Restore point

- Git tag **`v1.0-stable`** at commit `d7161fb` (pre-Cloudflare, Next 16 era).
- The latest commit is the working Next-15-on-Cloudflare state.
- Hard rollback: `git reset --hard v1.0-stable`.

## Owner / accounts

- GitHub: **DAMiC3** (bernardmanne3@gmail.com)
- Cloudflare account subdomain: `bernardmanne3.workers.dev`
- Supabase user / app account: `bernardmanne3@gmail.com` (manually set to Standard plan via `set_plan`)
- WhatsApp / payments: 079 905 0642 · Investec acc 10012930071 · branch 580105 (MA Bernard)

## Pricing — see ADR-002 before changing

- Standard R1000/mo → R300 usage cap (70% margin)
- Pro R3000/mo → R1500 cap (5× Standard, 50% margin)
- Allowance shown as **percentage only** — never Rand or tokens
- Manual EFT + WhatsApp BVB activation. No card payments yet.
- Assign plans via SQL: `select public.set_plan('<uuid>', 'standard');`

## Where to go for depth

- `docs/categories/README.md` — **the system split into 7 categories** (Payments & Enforcement, Marking & PDFs, UI, Error Handling, AI, DB & Hosting, Auth & Onboarding). Category 1 is fully documented; the rest are scaffolds. Update a category's doc whenever you change its code.
- `docs/HANDOVER.md` — full state, architecture, gotchas, open items
- `docs/adr-001-marking-ai-provider.md` — AI provider decision
- `docs/adr-002-pricing-and-plans.md` — pricing model (Accepted)
- `docs/cost-and-pricing-notes.md` — cost reasoning
- `scripts/gen-testpack.mjs` — regenerates 4 test student PDFs + memo into `C:\Users\Michael Bernard\TestPapers`
- `scripts/debug-mark.mjs` / `scripts/extract-debug.mjs` — diagnostic utilities
