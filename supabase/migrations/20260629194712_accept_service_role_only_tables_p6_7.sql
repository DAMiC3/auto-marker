-- P6-7: formally accept the "RLS enabled, no policy" advisor INFO (0008) on the
-- two service-role-only tables. This is intentional: these tables have no
-- authenticated/anon read path by design; only SECURITY DEFINER functions and the
-- service role touch them. Encode that intent as table comments so the finding is
-- understood as accepted, not a missing-policy bug.
comment on table public.revenue_events is
  'Service-role-only financial ledger. RLS enabled with ZERO policies BY DESIGN (advisor 0008 INFO is expected/accepted, P6-7). No anon/authenticated read path; rows are written only by the log_revenue_event() trigger. Read via service role only.';

comment on table public.trial_claims is
  'Service-role-only one-trial-per-email ledger. RLS enabled with ZERO policies BY DESIGN (advisor 0008 INFO is expected/accepted, P6-7). Read/written only by set_plan() (SECURITY DEFINER) and the service role.';
