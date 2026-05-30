# AutoMark — full handover

This document is the source of truth for the project state, intended for a new contributor (human or AI) picking it up cold.

---

## 1. What it is

**AutoMark** is a SaaS-style web app that automatically marks **typed university test PDFs** against a **memo (answer key)**, stamps the marks onto the PDF (ticks/crosses/half-marks, per-question scores, marker's notes), and moves the marked PDF to a destination folder. Built primarily for **South African university lecturers**, with R-priced subscription plans paid by manual EFT + WhatsApp activation.

The owner is the only user so far. Goal: launch publicly once happy, get the first 3 customers, then revisit Vercel for full-stack reliability.

---

## 2. Architecture at a glance

```
┌──────────────────────────┐      ┌────────────────────┐
│ Browser (lecturer)       │◀────▶│  GitHub Pages      │
│ - File System Access API │      │  (marketing site)  │
│ - PDF render (pdfjs)     │      │  damic3.github.io/ │
│ - PDF stamp (pdf-lib)    │      │  automark-site/    │
└────────────┬─────────────┘      └────────────────────┘
             │ HTTPS
             ▼
┌──────────────────────────────────────────┐
│ Cloudflare Workers (the app)             │
│ auto-marker.bernardmanne3.workers.dev    │
│ - Next.js 15 on @opennextjs/cloudflare   │
│ - Edge middleware (Supabase session)     │
│ - API routes /api/mark, /api/mark/batch  │
└─────────┬───────────────────┬────────────┘
          │                   │
          ▼                   ▼
┌────────────────────┐  ┌─────────────────────┐
│ Supabase           │  │ Anthropic API       │
│ (Postgres + Auth)  │  │ (Claude Sonnet 4.6  │
│ profiles +         │  │ / Opus 4.7, vision) │
│ usage_events       │  │                     │
└────────────────────┘  └─────────────────────┘
```

- **Browser does the heavy PDF work** (rendering, text extraction, stamping). The server is light — mostly auth and one Claude call per paper.
- **No file uploads to a server.** The browser reads/writes the user's local folder directly via the File System Access API.
- **Marking pipeline:** extract text + y-positions client-side → send text (not images) to Claude with the memo → parse JSON back → stamp shapes/scores in the right margin + notes at the bottom → write `<name> (marked).pdf` to the To folder, remove original from From folder.

---

## 3. Repos

| Repo | Purpose | Hosted on |
|---|---|---|
| `DAMiC3/auto-marker` | The app (this repo) | Cloudflare Workers |
| `DAMiC3/automark-site` | Static landing page (`index.html`) | GitHub Pages |

---

## 4. URLs and accounts

| | Value |
|---|---|
| Live app | https://auto-marker.bernardmanne3.workers.dev |
| Landing site | https://damic3.github.io/automark-site/ |
| Supabase project | `pdlkkfedovssaaecemkp` |
| Cloudflare account subdomain | `bernardmanne3.workers.dev` |
| GitHub user | `DAMiC3` |
| Owner email | `bernardmanne3@gmail.com` |
| Payment WhatsApp | 079 905 0642 |
| Bank | MA Bernard · Investec · acc 10012930071 · branch 580105 |

---

## 5. Local development

### One-time
```bash
git clone https://github.com/DAMiC3/auto-marker.git
cd auto-marker
npm install
# create .env.local with: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL,
#                         NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

### Each dev session
```bash
npm run dev        # from a normal terminal
# OR from the Claude Code agent shell:
unset ANTHROPIC_API_KEY && npm run dev
```
→ http://localhost:3000

### Test pack
```bash
node scripts/gen-testpack.mjs
```
Creates `C:\Users\Michael Bernard\TestPapers\` with `Memo.pdf` in root and four students (`Student_A.pdf`…`Student_D.pdf`) in `Inbox/`. Expected scores at strictness 7: A ≈ 12/15, B ≈ 2/15, C ≈ 6–8/15, D ≈ 14–15/15.

---

## 6. Build & deploy

### Build for Cloudflare
```bash
rm -rf .next .open-next
npm run build:cf
```
Produces `.open-next/worker.js` + `.open-next/assets/`. The `next build` succeeds at root; the OpenNext step bundles it into a worker. `next dev` is unaffected.

### Deploy to Cloudflare (manual, from Windows)
```bash
mv open-next.config.ts open-next.config.ts.bak
npx wrangler deploy
mv open-next.config.ts.bak open-next.config.ts
```
The temporary rename of `open-next.config.ts` is **required on Windows** — wrangler detects the OpenNext project and tries to call `opennextjs-cloudflare deploy`, which has known Windows issues. Hiding the config makes wrangler do a plain worker deploy of the existing `.open-next/worker.js`.

### Future: auto-deploy on push (not yet wired)
If we ever connect Cloudflare Workers Builds to GitHub:
- Build command: `npm run build:cf`
- Wrangler/Workers picks up `wrangler.jsonc`
- Add the same env vars + secrets in the Cloudflare dashboard (not just wrangler.jsonc) so the build host has them too.

### Restore landing site
```bash
cd ../automark-site
# edit index.html
git add . && git commit -m "..." && git push
# GitHub Pages auto-rebuilds in ~1 minute
```

---

## 7. Configuration files

| File | What it is |
|---|---|
| `wrangler.jsonc` | Cloudflare Worker config: name `auto-marker`, main `.open-next/worker.js`, `nodejs_compat` + `global_fetch_strictly_public` flags, public env vars under `vars`, observability on |
| `open-next.config.ts` | Minimal `defineCloudflareConfig({})` — required for `npm run build:cf` to know it's a Cloudflare target |
| `next.config.ts` | Standard Next 15 config |
| `middleware.ts` | Edge middleware that gates protected routes via Supabase session |
| `proxy.ts` | **Removed.** Was Next 16's replacement for middleware but OpenNext can't bundle it |
| `.env.local` | Local dev keys (gitignored) |
| `netlify.toml` | Vestigial — Netlify deploy paused; safe to ignore |

---

## 8. Database (Supabase project `pdlkkfedovssaaecemkp`)

Two tables in `public`:

### `profiles` (one row per auth user, created by trigger on signup)
- `id uuid PK` — references `auth.users(id)`
- `full_name`, `subject` (text)
- `plan text` — `'none' | 'standard' | 'pro'`
- `allowance_cap_zar numeric` — the R cap (300 for Standard, 1500 for Pro)
- `used_zar numeric` — running spent
- `period_start`, `period_end timestamptz` — the 30-day window
- RLS: users select their own only

### `usage_events` (audit log)
- `user_id`, `papers`, `model_tier`, `cost_zar`, `file_name`, `created_at`
- RLS: users select their own only

### Functions (service-role only)
- `set_plan(p_user, p_plan)` — assigns plan, resets used to 0, sets new 30-day window
- `add_usage(p_user, p_cost, p_papers, p_tier, p_file)` — inserts a usage row and increments `used_zar`
- `handle_new_user()` — trigger on `auth.users` insert that auto-creates a profile

To assign a plan to a user (admin / SQL editor):
```sql
select id from auth.users where email='someone@example.com';
select public.set_plan('<that-uuid>', 'standard');
```

---

## 9. Marking pipeline (the core)

**Client side** (`lib/markPaper.ts`):
1. `preparePaper(file)` — pdfjs extracts each page's text grouped into lines with normalized y-positions. Pages without a text layer are rendered to PNG and sent as images (fallback). Truly blank pages are skipped via a pixel check (`isCanvasBlank`).
2. POST `/api/mark` with `{ memoText, subject, strictness, quality, markTypes, pages }`.
3. `stampPaper` (pdf-lib) draws the shape + score in the **right margin** at the answer's y, and writes a wrapped `Marker's notes:` block + the AI's `Overall: …` summary at the bottom of the last page.

**Server side** (`app/api/mark/route.ts`):
- Identifies the user via the Supabase session (cookie).
- Checks the user's plan allowance — returns `402 allowance_exhausted` if used ≥ cap.
- Builds the prompt using `lib/markingPrompt.ts`:
  - System prompt (cached) — accuracy-first, no hallucinations, expects short-keyed JSON.
  - Memo block (cached) — `MEMO (answer key): …`.
  - One block per page (`--- Page N ---\n[y=0.NN] text line…`) or an image block.
- Calls Claude (`claude-sonnet-4-6` or `claude-opus-4-7`).
- `parseMarkResponse` robustly extracts JSON even when the model adds prose around it (handles fenced ```json blocks and bare {…}).
- Records cost via `add_usage` (service-role).
- Returns the parsed annotations + total/available/percentage + summary.

**Batch flow** (`app/api/mark/batch/route.ts`):
- POST submits all papers to Anthropic's Batch API (50% cheaper, async).
- GET polls until done, then returns mapped results keyed by `customId`.

**Key short JSON keys the AI returns** (`p, y, s, m, c`) get re-expanded to `{ page, y, shape, marks, comment }` for the rest of the code.

---

## 10. Pricing — see ADR-002

| Plan | Price | Allowance cap | Margin |
|---|---|---|---|
| Standard | R1000/mo | R300 of API cost | 70% |
| Pro | R3000/mo | R1500 (5×) | 50% |

- Displayed as **% only**, never Rand/tokens.
- Activation: manual EFT + WhatsApp BVB → run `set_plan` in SQL editor.
- "Run out → buy again" model. No top-ups, no rollover, no discounts, no surge.

---

## 11. Known gotchas

1. **Agent shell shadows `ANTHROPIC_API_KEY`** (see AGENTS.md) — `unset ANTHROPIC_API_KEY && npm run dev`.
2. **Don't run `npm run build` while `npm run dev` is running** — they share `.next/` and corrupt each other (we hit `.next/dev/types/routes.d.ts` garbage). Stop dev first.
3. **OpenNext deploy on Windows fails** — hide `open-next.config.ts` and use plain `wrangler deploy`. See section 6.
4. **Next 16 doesn't work on Cloudflare yet** — stuck on 15.5.18 until OpenNext catches up.
5. **Service worker can serve stale shells** if the server is down. We use network-first + auto-update banner (`components/UpdatePrompt.tsx`); if a stale shell ever appears, in DevTools → Application → Service Workers → Unregister + clear `automark-v*` caches.
6. **Memo in the Inbox** = the memo gets "marked" too (scores 0/15 since it has no student answers). Keep `Memo.pdf` outside the From folder.
7. **Anthropic free-tier shadow / no key in production** — the `/api/mark` route returns `503 "AI marking isn't configured"` if `ANTHROPIC_API_KEY` is unset. There is no mock fallback (we removed it because it stamped fake marks).

---

## 12. Open items / roadmap (rough priority)

1. **Connect Cloudflare Workers Builds for auto-deploy** — currently manual `wrangler deploy`. Need to set build command to `npm run build:cf` and add env vars in the Cloudflare dashboard.
2. **SEO / Search Console** for the landing site (it's a fresh GitHub Pages site, not yet indexed).
3. **Custom domain** (e.g. `automark.co.za`) — Cloudflare Registrar sells at cost; can host both the app and site behind it.
4. **Wire landing-page buttons** at https://damic3.github.io/automark-site/ to point at the live app URL (`Get started` → `…workers.dev/login`).
5. **Plan/usage UI polish** — show period_end somewhere, link the allowance bar to /plans (done).
6. **Payments automation** — currently manual EFT/WhatsApp. Future: Paystack or similar for SA.
7. **Vercel migration** — once paying customers exist, revisit Vercel for native Next 16 + zero adapter risk.
8. **OCR-then-reason pipeline** — see `docs/cost-and-pricing-notes.md`; optional cost optimisation.
9. **Account-synced memos + settings** — currently device-local (IndexedDB + localStorage). Move to Supabase when multi-device matters.

---

## 13. Decisions captured

- **ADR-001** — Marking AI provider strategy: interface + Claude default; Gemini/Ollama later.
- **ADR-002 (Accepted)** — Pricing and plan model (Standard/Pro, % display, buy-again).
- **cost-and-pricing-notes.md** — Where the cost actually is, levers, provider trade-offs.

---

## 14. How to use this with a fresh Claude session

1. Open Claude Code in `C:\Users\Michael Bernard\auto-marker`.
2. The session auto-loads `CLAUDE.md` → which imports `AGENTS.md` → giving Claude the tight brief.
3. Point Claude at this file (`docs/HANDOVER.md`) for the deep state.
4. Mention recent goals/decisions in your prompt, and Claude picks up where the previous session left off.
