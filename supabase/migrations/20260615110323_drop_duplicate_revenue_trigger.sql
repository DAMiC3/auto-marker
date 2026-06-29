-- P1-1: remove the duplicate revenue logger. log_plan_revenue() + its trigger
-- overlapped with log_revenue_event() (the keeper), double-logging a paid plan
-- change. The keeper is strictly better: excludes owner test rows, uses
-- plan_price(), covers INSERT, and sets search_path. revenue_events is empty,
-- so there is no data to reconcile.
drop trigger if exists trg_log_plan_revenue on public.profiles;
drop function if exists public.log_plan_revenue();
