-- P6-4 (cont.): the GraphQL-usage revoke (prev migration) closed the GraphQL endpoint
-- for the API roles, but advisors 0026/0027 are static "role can SELECT this table"
-- checks, so they still fire while the SELECT grant exists.
-- trial_claims is service-role-only (read/written only by set_plan SECURITY DEFINER +
-- the service role; nothing client-side touches it), so revoking its SELECT grant from
-- anon/authenticated is safe and clears its findings.
-- profiles/usage_events deliberately keep their `authenticated` SELECT grant — the app's
-- REST reads (AllowanceBar/PlanNotice/SettingsPanel/lib/usage) require it; RLS still
-- gates rows. Those two 0027 findings are accepted (see docs/categories/06-db-and-hosting.md).
revoke select on public.trial_claims from anon, authenticated;
