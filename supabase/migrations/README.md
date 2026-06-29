# Supabase migrations (exported)

These `.sql` files are the **version-controlled export of the AutoMark Supabase schema**
(project `pdlkkfedovssaaecemkp`) — addresses backlog item **P6-8** (schema was previously
not in VCS; the DB drifted independently of git).

Each file is named `<version>_<name>.sql`, where `<version>` is the timestamp Supabase
assigned the migration. The set, replayed in filename order, reproduces the schema from an
empty database.

## ⚠️ How migrations are actually applied (read before adding one)

Migrations are **applied to the remote project directly** — historically via the Supabase
SQL editor / dashboard, and now via the Supabase MCP `apply_migration` tool. The repo is the
**mirror**, not the driver: applying happens on the remote first, then we export the file
here so git matches reality. There is currently **no `supabase db push` step wired up** and
no staging project (see **P6-9**).

**When you change the schema:**
1. Apply the change to the remote project (MCP `apply_migration`, or the SQL editor).
2. Add the matching `<version>_<name>.sql` file here, verbatim, in the same commit as any
   code/doc that depends on it.
3. Re-run the advisors (`get_advisors`) and update `docs/categories/06-db-and-hosting.md`.

Keep these files **append-only history** — don't rewrite an old migration to "fix" it; add a
new one (as `drop_duplicate_revenue_trigger` and the `cat6_p6_2_*` pair did).

## History notes

- `20260604172508_log_plan_revenue_trigger.sql` was later **dropped** by
  `20260615110323_drop_duplicate_revenue_trigger.sql` (duplicate of `log_revenue_event`, P1-1).
  Both are kept for a faithful, replayable history.
- `20260629192954_cat6_advisor_cluster_*` + `20260629193059_cat6_p6_2_revoke_public_execute`
  are the Category-6 advisor fixes; the second is a correction to the first (the initial
  `REVOKE ... FROM anon, authenticated` missed the inherited `PUBLIC` grant).

## Related, not in this folder

- **D1 dead-letter buffer schema** lives separately at `db/d1/pending_usage.sql`
  (Cloudflare D1, not Postgres).
- Table/column **semantics** → `docs/categories/01-payments-and-enforcement.md`.
- Platform/RLS/function inventory → `docs/categories/06-db-and-hosting.md`.
