-- Category 6 DB & Hosting advisor cluster: P6-2, P6-3, P6-5, P6-6

-- P6-2 (advisor 0028/0029): a SECURITY DEFINER trigger function must never be
-- directly invocable via /rest/v1/rpc. Revoke direct execute from API roles.
-- (Triggers fire as table owner regardless, so this does not affect revenue logging.)
-- NOTE: this revoke alone was insufficient — see the corrective migration
-- 20260629193059_cat6_p6_2_revoke_public_execute (PUBLIC grant remained).
revoke execute on function public.log_revenue_event() from anon, authenticated;

-- P6-3 (advisor 0011): pin search_path on the plan_price helper.
alter function public.plan_price(text) set search_path = public;

-- P6-5 (advisor 0003): wrap auth.uid() in a scalar subselect so Postgres evaluates
-- it once per query (initplan) instead of once per row.
alter policy profiles_select_own on public.profiles using ((select auth.uid()) = id);
alter policy usage_select_own  on public.usage_events using ((select auth.uid()) = user_id);

-- P6-6 (advisor 0001): covering index for the revenue_events.user_id foreign key.
create index if not exists revenue_events_user_id_idx on public.revenue_events (user_id);
