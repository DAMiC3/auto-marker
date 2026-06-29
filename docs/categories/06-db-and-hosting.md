# Category 6 — DB & Hosting

**Status:** ✅ Fully documented (extra-detailed) · **Last verified against live DB + config:** 2026-06-12
**Owner:** Michael Bernard · **Supabase project:** `pdlkkfedovssaaecemkp`

The infrastructure substrate: the Postgres database (schema, RLS, functions, triggers), and where/how the app runs (Cloudflare Workers via OpenNext, build, deploy, secrets). Category 1 owns the *meaning* of the tables; this category owns the *platform they sit on*.

> Verified directly against the live Supabase project and the repo config on 2026-06-12 — including details **not** previously in HANDOVER (a third table + a revenue subsystem, see §3.3 / §5).

---

## 1. Topology at a glance

| Piece | Host | URL / id |
|-------|------|----------|
| App (Next.js) | **Cloudflare Workers** (via `@opennextjs/cloudflare`) | `https://auto-marker.bernardmanne3.workers.dev` |
| DB + Auth | **Supabase** | project `pdlkkfedovssaaecemkp` (`…supabase.co`) |
| Landing site | **GitHub Pages** (separate repo `DAMiC3/automark-site`) | `https://damic3.github.io/automark-site/` |
| Old deploy | **Netlify** — paused (credits exhausted), config still in repo | ignore |

---

## 2. Supabase project facts
- **Project ref:** `pdlkkfedovssaaecemkp`
- **Postgres extensions installed:** `plpgsql 1.0`, `pgcrypto 1.3`, `uuid-ossp 1.1`, `pg_graphql 1.5.11`, `pg_stat_statements 1.11`, `supabase_vault 0.3.1` (the default Supabase set — nothing exotic).
- **Migration approach:** changes are applied **directly to the remote project** (via the Supabase SQL editor or MCP `apply_migration`). The full migration history is now **exported to `supabase/migrations/*.sql`** and version-controlled (P6-8, 2026-06-29) — the remote is still the *driver* (apply there first), the repo is the *mirror* (commit the matching file after). See `supabase/migrations/README.md`.

---

## 3. Schema — four tables (all in `public`, all RLS-enabled)

### 3.1 `profiles` (4 rows) — the customer table
PK `id uuid` → FK `auth.users(id)`. Columns + the bits that matter at the DB level:
- `plan text` default `'none'` with a **CHECK constraint**: `plan IN ('none','trial','standard','pro')` — the DB enforces the plan vocabulary; an invalid plan write is rejected.
- `allowance_cap_zar numeric` default `0`, `used_zar numeric` default `0`.
- `period_start`, `period_end timestamptz` (nullable).
- `full_name`/`subject text` default `''`, `created_at timestamptz` default `now()`.

> Full column semantics → **Category 1 §2.1**. The CHECK constraint is the new detail: it's a second guard rail behind `set_plan`.

### 3.2 `usage_events` (18 rows) — the audit log
PK `id bigint` **identity ALWAYS** (auto), FK `user_id → auth.users(id)`. `papers int` default 1, `model_tier text` default `'standard'`, `cost_zar numeric` default 0, `file_name text` nullable, `created_at` default `now()`. Append-only; written by `add_usage`. → **Category 1 §2.2**.

### 3.3 `revenue_events` (0 rows) — ⚠️ the revenue ledger (undocumented until now)
**This table exists and is wired with triggers, but was not in HANDOVER and was listed as "not built" in Category 1.** Columns:
`id bigint` (identity), `user_id uuid` (FK, nullable), `email text`, `plan text`, `previous_plan text`, `amount_zar numeric` default 0, `event_type text`, `created_at` default `now()`.

It is populated **automatically by triggers** on `profiles` (§5.2) whenever someone moves onto/renews a **paid** plan. It's empty today only because no non-owner paid-plan transition has happened since the triggers were installed (the one paid profile — the owner — predates them, and trigger logging is not retroactive).

### 3.4 `trial_claims` (P1-7, added 2026-06-15) — one-trial-per-email ledger
`email text` PK, `user_id uuid` (nullable), `claimed_at timestamptz` default `now()`. **RLS enabled, zero policies** (service-role / `SECURITY DEFINER` only — like `revenue_events`). Keyed by **email**, not profile id, so it survives account deletion → a deleted-and-recreated account cannot claim a second free trial. Written/checked exclusively by `set_plan` when granting a `'trial'`. → **Category 1 §4.1 / P1-7**.

---

## 4. RLS model
- **`profiles`** — one policy `profiles_select_own`: `SELECT` for `authenticated` where `(select auth.uid()) = id`.
- **`usage_events`** — one policy `usage_select_own`: `SELECT` for `authenticated` where `(select auth.uid()) = user_id`.

  > Both policies wrap `auth.uid()` in a scalar subselect (initplan) so it's evaluated once per query, not once per row — P6-5 fix, 2026-06-29.
- **`revenue_events`** — **RLS enabled, zero policies** → no `authenticated` user can read it at all. Only the **service-role key** (which bypasses RLS) can. Correct for sensitive revenue data.
- **All writes** to every table go through `SECURITY DEFINER` functions called with the **service-role key** server-side. The client has **no write path** to any table; it can only read its own `profiles`/`usage_events` rows. This is the security spine of the metering system.

---

## 5. Functions & triggers (the full inventory)

### 5.1 Core metering (documented in Category 1 §4)
| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger `on_auth_user_created` on `auth.users` INSERT → creates the `profiles` row (defaults → R0/none). |
| `set_plan(p_user, p_plan)` | Assign/renew a plan; resets `used_zar`, sets cap + period (trial 7d/R50, standard 30d/R300, pro 30d/R1500). **Enforces one trial per email** via `trial_claims` (P1-7). |
| `add_usage(p_user, p_cost, p_papers, p_tier, p_file)` | Append a `usage_events` row + increment `profiles.used_zar`. |

### 5.2 Revenue logging (single-trigger as of 2026-06-15)
| Object | What it does |
|--------|--------------|
| `plan_price(p_plan)` | `IMMUTABLE` helper: standard→1000, pro→3000, else 0. `search_path` pinned to `public` (P6-3 fix, 2026-06-29). |
| `log_revenue_event()` | **The one revenue logger.** Trigger fn: on paid-plan INSERT/UPDATE, inserts a `revenue_events` row using `plan_price()`. **Excludes the owner** (`bernardmanne3@gmail.com`). Classifies `new`/`renewal`/`change`. Sets `search_path`. **`EXECUTE` revoked from `public`/`anon`/`authenticated`** so it can't be called directly via REST RPC — only the trigger (owner context) and service-role invoke it (P6-2 fix, 2026-06-29). |

**Triggers on `profiles`:**
- `trg_log_revenue_insert` → `log_revenue_event` (INSERT, paid plans)
- `trg_log_revenue_update` → `log_revenue_event` (UPDATE, when `plan`/`period_start` changes)

> ✅ **Duplicate-revenue bug FIXED (2026-06-15, P1-1/P6-1).** The older overlapping `log_plan_revenue()` + its `trg_log_plan_revenue` trigger were **dropped** (migration `drop_duplicate_revenue_trigger`). They had hardcoded amounts, did **not** exclude the owner, and didn't set `search_path`. `revenue_events` was empty, so no data reconciliation was needed. Only `log_revenue_event` remains.

---

## 6. Hosting — Cloudflare Workers (via OpenNext)

`wrangler.jsonc`:
- **`main`: `.open-next/worker.js`** — the OpenNext-compiled Worker.
- **`compatibility_date`: `2025-05-01`**, **flags:** `nodejs_compat`, `global_fetch_strictly_public`.
- **`assets`** — served from `.open-next/assets`, binding `ASSETS`, `run_worker_first: true` (the Worker handles routing first, then static assets).
- **`observability.enabled`: `true`** — Cloudflare Workers logs/analytics **are** retained in the CF dashboard. *(This refines Category 4: live tail + dashboard logs exist; what's missing is external aggregation, search, and alerting — not all logging.)*
- **`vars`** (public, committed): `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The anon key being in the repo is **fine by design** — it's the public key, gated by RLS. The **service-role key is NOT here** (it's a Worker secret).

---

## 7. Build & deploy (manual)

The repo is **not** wired to Cloudflare Workers Builds — deploys are manual from the local machine.

`package.json` scripts: `dev` (`next dev`), `build` (`next build`), **`build:cf`** (`opennextjs-cloudflare build`), `preview:cf`, `lint`.

**Deploy sequence** (from `AGENTS.md`, because OpenNext's own deploy fails on Windows):
```bash
rm -rf .next .open-next
npm run build:cf
mv open-next.config.ts open-next.config.ts.bak   # hide it so plain wrangler deploy works
npx wrangler deploy
mv open-next.config.ts.bak open-next.config.ts
```
`open-next.config.ts` is a bare `defineCloudflareConfig({})`; `next.config.ts` is empty defaults. The hide-config dance exists purely to dodge a Windows-specific OpenNext deploy failure — plain `wrangler deploy` uploads `.open-next/worker.js` cleanly.

**Restore point:** git tag `v1.0-stable` at commit `d7161fb`. Hard rollback: `git reset --hard v1.0-stable`.

---

## 8. Secrets & environment

| Name | Where it lives | Notes |
|------|----------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `wrangler.jsonc` vars (public) | safe to commit |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `wrangler.jsonc` vars (public) | safe (RLS-gated) |
| `ANTHROPIC_API_KEY` | **Worker secret** (`wrangler secret put`) | never committed |
| `SUPABASE_SERVICE_ROLE_KEY` | **Worker secret** | never committed; bypasses RLS |
| Local dev keys | `.env.local` (gitignored) | — |

> ⚠️ **Agent-shell gotcha:** the Claude Code agent shell sets `ANTHROPIC_API_KEY=""` (empty), and Next.js won't override an existing env var — so `.env.local`'s key is ignored when `npm run dev` starts from this shell. Fix: `unset ANTHROPIC_API_KEY && npm run dev`. End-user terminals don't hit this.

---

## 9. Stack pins & platform constraints (do not bump blindly)

- **Next.js `15.5.18` — NOT 16.** `@opennextjs/cloudflare` can't render Next 16 pages yet (`TypeError: components.ComponentMod.handler is not a function`). React `19.2.4`, Tailwind v4, TypeScript 5.
- **Edge middleware in `middleware.ts`** — *not* Next 16's `proxy.ts`. OpenNext only supports edge middleware. (Behaviour → Category 7.)
- **OpenNext `@opennextjs/cloudflare ^1.19.11`**, **wrangler `^4.95.0`**.
- **Netlify (`netlify.toml`)** still in the repo (`@netlify/plugin-nextjs`, publish `.next`) but the deploy is **paused** — ignore it. It's a fallback path if Cloudflare ever becomes painful (the HANDOVER notes a possible future Vercel migration once paying customers exist).

---

## 10. Dependencies of note
- **`mammoth ^1.12.0`** is a declared dependency (a `.docx` → text/HTML parser) but is **imported nowhere in source** (grep-confirmed; only in `package.json`/lockfile). It's aspirational — intended for `.docx` memo/answer parsing (the dead `UploadZone` that shared the `.docx` ambition was deleted 2026-06-18, P3-3). **Either wire it up or drop it.**
- Runtime deps are lean: `@anthropic-ai/sdk`, `@supabase/ssr` + `@supabase/supabase-js`, `pdf-lib`, `pdfjs-dist`, `next`, `react`/`react-dom`.

---

## 11. Known gaps & issues (DB & hosting)

- ✅ **Duplicate revenue triggers — FIXED (2026-06-15, §5.2).** Dropped `log_plan_revenue` + trigger; only `log_revenue_event` remains.
- ✅ **Schema now in VCS (P6-8, 2026-06-29)** — all Supabase migrations exported to `supabase/migrations/*.sql`; D1 buffer schema lives at `db/d1/pending_usage.sql`. The schema is reproducible from git. Remaining gap is automation (no `supabase db push` / staging — P6-9).
- **No connection pooling configured** — each Worker request opens its own Supabase connection. Fine now (4 users); needs Supabase PgBouncer/pooling at scale (expansion plan Phase 3).
- **Manual deploy, no CI/CD** — the hide-config wrangler dance is error-prone; wiring Cloudflare Workers Builds (or Vercel) is a future step.
- **Single region, no SA data residency** — Cloudflare has no in-country PoP that keeps data in ZA; an institutional POPIA requirement would force an architecture change (expansion plan Phase 4).
- **`mammoth` unused** (§10).

---

## 12. Invariants — do not break these
1. **Only service-role functions write to the tables.** Never add a client-side write path; RLS has no write policies on purpose.
2. **`revenue_events` stays policy-less** (service-role read only) — it's financial data.
3. **Don't bump Next past 15.x** without re-reading the OpenNext constraint (§9).
4. **Service-role / Anthropic keys are Worker secrets, never repo vars.**
5. **The `plan` CHECK constraint and `set_plan` must agree** — adding a plan tier needs both updated.
6. **Resolve the duplicate revenue triggers before the first real paid customer** or the ledger starts wrong.

---

## Problems / To-Fix Backlog

> Severity: 🔴 fix before real paying customers · 🟠 important · 🟡 minor/polish · 🔵 not-built/roadmap. Items marked *(advisor NNNN)* are from Supabase's own database linter (run 2026-06-12).

| ID | Sev | Problem | Fix direction |
|----|-----|---------|---------------|
| ~~**P6-1**~~ | 🟢 | ✅ **FIXED (2026-06-15).** Duplicate revenue triggers — `log_plan_revenue` + trigger dropped (migration `drop_duplicate_revenue_trigger`); only `log_revenue_event` remains. (= P1-1) | Done. |
| ~~**P6-2**~~ | 🟢 | ✅ **FIXED (2026-06-29).** Trigger fn `log_revenue_event()` was `SECURITY DEFINER` and executable by `anon`/`authenticated` via `/rest/v1/rpc/…` *(advisor 0028/0029)*. Revoked `EXECUTE` from `public, anon, authenticated` (migrations `cat6_advisor_cluster_p6_2_3_5_6` + `cat6_p6_2_revoke_public_execute`). ⚠️ **Lesson:** revoking from `anon`/`authenticated` alone is NOT enough — Postgres grants `EXECUTE` to pseudo-role `PUBLIC` by default and those roles inherit it; you must revoke from `PUBLIC` too. ACL is now `{postgres,service_role}` only; advisor cleared. | Done. |
| ~~**P6-3**~~ | 🟢 | ✅ **FIXED (2026-06-29).** Pinned `plan_price` search_path *(advisor 0011)* — `ALTER FUNCTION public.plan_price(text) SET search_path = public` (migration `cat6_advisor_cluster_p6_2_3_5_6`). Advisor cleared. | Done. |
| **P6-4** | 🟠 | **GraphQL schema exposure** *(advisor 0027/0026)* — `profiles`, `usage_events` and `trial_claims` are discoverable by any `authenticated` user via the auto GraphQL API; `trial_claims` is also exposed to `anon` *(0026)*. RLS still limits *rows*, but the schema is visible. **Awaiting your decision among 3 options (2026-06-29).** Checks done: app uses **zero GraphQL** (all reads are REST `.from()` via the browser anon client → `authenticated` role), so revoking `SELECT` from `authenticated` on `profiles`/`usage_events` **would break** AllowanceBar/PlanNotice/SettingsPanel/`lib/usage`. `trial_claims` is read by nothing client-side. | **Opt 1 (recommended):** lock down the unused GraphQL API (`revoke usage on schema graphql/graphql_public from anon, authenticated`) → clears 0026/0027 for *all* tables, zero app impact. **Opt 2:** revoke `SELECT` on `trial_claims` from anon/authenticated only (safe), accept profiles/usage_events. **Opt 3:** accept & document (RLS protects rows). |
| ~~**P6-5**~~ | 🟢 | ✅ **FIXED (2026-06-29).** Rewrote both RLS policies to `(select auth.uid())` *(advisor 0003)* via `ALTER POLICY` (migration `cat6_advisor_cluster_p6_2_3_5_6`). Advisor cleared. | Done. |
| ~~**P6-6**~~ | 🟢 | ✅ **FIXED (2026-06-29).** Added `revenue_events_user_id_idx` covering the FK *(advisor 0001)* (migration `cat6_advisor_cluster_p6_2_3_5_6`). Advisor 0001 cleared; now shows as INFO "unused index" — expected on a 0-row table, it'll be used once revenue rows exist. | Done. |
| ~~**P6-7**~~ | 🟢 | ✅ **ACCEPTED (2026-06-29).** `revenue_events` **and** `trial_claims` are RLS-enabled with zero policies *(advisor 0008, INFO)* — intentional (service-role only). Encoded the rationale as `COMMENT ON TABLE` on both (migration `accept_service_role_only_tables_p6_7`) so the INFO reads as accepted, not a missing-policy bug. | Done (accepted by design). |
| ~~**P6-8**~~ | 🟢 | ✅ **FIXED (2026-06-29).** All 12 remote migrations exported to `supabase/migrations/*.sql` (+ a README documenting the apply→export workflow). The schema is now reproducible from git. *(Going forward: apply on remote, then commit the matching file — see the README. Full staging/push automation is P6-9.)* | Done. |
| **P6-9** | 🟠 | **No staging/prod separation** — migrations (incl. via MCP) hit prod directly; a bad change has no buffer. | Add a staging project or branch DB. |
| **P6-10** | 🟡 | **`mammoth` unused dependency** — declared, imported nowhere. **Investigated 2026-06-29:** `mammoth` is a `.docx`→text/HTML parser. The marking pipeline ingests memo + answers as **PDF only** (text extracted client-side via `pdfjs-dist`, then POSTed to `/api/mark/batch` as `memoText`/`pages`). `mammoth` was meant to add a **Word `.docx` upload path** (`mammoth.extractRawText({arrayBuffer})` → same `memoText`/`pages`), since lecturers often have memos in Word — the deleted `UploadZone` (P3-3) shared that ambition. It's a real, sensible feature, just never wired. **Decision still needed: drop, or wire the `.docx` path.** | Drop it, or wire up `.docx` parsing (feeds the existing text pipeline). |
| ~~**P6-11**~~ | 🟢 | ✅ **DONE (2026-06-29).** Wrote `docs/runbooks/db-backup-restore.md` — manual `pg_dump`/`pg_restore` procedure, Supabase automated-backup + PITR restore, schema-from-git rebuild, post-restore checklist, RPO/RTO. ⚠️ **One human step left:** confirm the project's **backup tier** in the Supabase dashboard (Database → Backups) and fill in the runbook's footer — Free tier has *no* automated backups, which would make scheduled manual dumps mandatory. | Done (pending tier confirmation in dashboard). |
| **P6-12** | 🔵 | **Scale/infra not built** — connection pooling (Phase 3), CI/CD (manual deploy), SA data residency (Phase 4). | Expansion plan Phases 2–4. |

---

## 13. Key files & objects (quick reference)
| File / object | Role |
|---------------|------|
| `wrangler.jsonc` | Worker config: main, flags, assets, observability, public vars |
| `open-next.config.ts` / `next.config.ts` | OpenNext + Next config (both near-empty defaults) |
| `package.json` | Scripts (`build:cf`), pinned deps |
| `netlify.toml` | Paused Netlify deploy config |
| `middleware.ts` | Edge auth middleware (Cat 7) |
| DB tables | `profiles`, `usage_events`, `revenue_events`, `trial_claims` |
| DB functions | `handle_new_user`, `set_plan`, `add_usage`, `plan_price`, `log_revenue_event` |
| `../../AGENTS.md` / `../HANDOVER.md` | Canonical infra briefing + deploy steps |

## 14. Cross-references
- Table meanings, plan logic, the metering functions → **Category 1**
- What logs revenue and the trial/plan model → **Category 1** (revenue ledger note now corrected here)
- Cloudflare observability vs missing alerting → **Category 4** (§8)
- Edge middleware auth behaviour → **Category 7**
- Connection pooling, Queues/R2/KV, CI, data residency → `../expansion-plan.md` Phases 2–4
