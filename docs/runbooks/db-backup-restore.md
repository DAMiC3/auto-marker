# Runbook — Database backup & restore (P6-11)

**Scope:** the Supabase Postgres database for AutoMark (project `pdlkkfedovssaaecemkp`,
region `eu-west-1`, Postgres 17). This is the only stateful store — losing it loses all
accounts, plans, usage metering, the revenue ledger, and trial claims. The Cloudflare Worker
and code are stateless and rebuildable from git (`v1.0-stable` is a *code* tag, **not** a data
backup — that distinction is the whole reason this runbook exists).

> ⚠️ **One thing you must verify in the dashboard** (can't be read from the API/MCP):
> your project's **backup tier**. Supabase backups depend on the plan:
> - **Free:** no automated daily backups. A data-loss event here is unrecoverable unless you
>   have your own dumps. **If this project is on Free, treat the "manual dump" section below
>   as mandatory and scheduled, not optional.**
> - **Pro:** daily automated backups, 7-day retention. Point-in-Time Recovery (PITR) is a
>   paid add-on (down-to-the-minute restore).
> Check: **Supabase Dashboard → Project → Database → Backups**. Record the result at the
> bottom of this file.

---

## 1. What to back up

| Asset | Where | Backed up by |
|-------|-------|--------------|
| Schema (tables, functions, triggers, RLS) | Postgres `public` | `supabase/migrations/*.sql` in git (P6-8) + DB backups |
| **Data** (profiles, usage_events, revenue_events, trial_claims) | Postgres | DB backups / manual dumps **only** |
| Auth users | `auth.users` | Supabase backups (managed) |
| D1 dead-letter buffer | Cloudflare D1 | `wrangler d1 export` (separate, rarely populated) |

The schema is reproducible from git. **The data is not** — that is what these backups protect.

## 2. Manual logical backup (works on any tier)

Run from a machine with `pg_dump` (Postgres 17 client) and the DB connection string
(Dashboard → Project → Settings → Database → Connection string → URI; use the **session**
pooler or direct connection, not the transaction pooler, for `pg_dump`):

```bash
# Full database (schema + data), compressed custom format
pg_dump "$AUTOMARK_DB_URL" -Fc -f "automark_$(date +%Y%m%d).dump"

# Data-only of the critical app tables (fast, small — good for a frequent cron)
pg_dump "$AUTOMARK_DB_URL" --data-only \
  -t public.profiles -t public.usage_events \
  -t public.revenue_events -t public.trial_claims \
  -f "automark_data_$(date +%Y%m%d).sql"
```

Store the dump off-machine (it contains personal data — treat per POPIA; encrypt at rest).
If on the Free tier, schedule the full dump (at least weekly) until the project is upgraded.

## 3. Restore options

### 3a. Restore from a Supabase automated backup (Pro/PITR)
1. Dashboard → Database → Backups.
2. Pick a daily backup (or a PITR timestamp) and **Restore**.
3. Supabase restores in place (this **overwrites** current data — confirm the target).
4. After restore: re-run `get_advisors` and smoke-test login + the allowance bar.

### 3b. Restore from a manual dump (any tier)
```bash
# Custom-format full restore into a fresh/empty database
pg_restore --clean --if-exists -d "$AUTOMARK_DB_URL" automark_YYYYMMDD.dump

# Or replay the schema from git, then load a data-only dump:
#   (apply supabase/migrations/*.sql in filename order first)
psql "$AUTOMARK_DB_URL" -f automark_data_YYYYMMDD.sql
```

### 3c. Rebuild schema only (no data) from git
Apply `supabase/migrations/*.sql` in filename order against an empty database. This recreates
every table/function/trigger/policy but **no rows** — useful for a fresh staging project
(P6-9), not for recovering lost customer data.

## 4. Post-restore checklist
- [ ] `get_advisors` (security + performance) shows the expected state (P6-2/3/5/6 fixed,
      P6-7 INFO accepted).
- [ ] Owner account (`bernardmanne3@gmail.com`) still on its plan (`select plan from
      public.profiles ...`).
- [ ] Login works; the allowance bar renders a plan + % left.
- [ ] `select count(*) from public.revenue_events;` matches expectations (was 0 at last check).
- [ ] Service-role secret still valid (server writes succeed).

## 5. Recovery objectives (current, informal)
- **RPO** (max acceptable data loss): 24h on Pro daily backups; **unbounded on Free** until a
  dump schedule exists — fix by upgrading or scheduling §2.
- **RTO** (time to restore): minutes for an in-place Supabase restore; ~1h for a manual
  `pg_restore` into a fresh project.

---

### Verified backup tier (fill in)
- Tier (Free / Pro / Pro + PITR): _____________
- Automated backup retention: _____________
- Last manual dump taken: _____________
- Checked by / date: _____________
