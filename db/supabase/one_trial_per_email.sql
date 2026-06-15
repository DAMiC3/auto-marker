-- Migration: one_trial_per_email (P1-7) — applied to Supabase project pdlkkfedovssaaecemkp 2026-06-15.
-- Enforces one free trial per email address, surviving account deletion/recreation
-- (the claim is keyed by email, not by the per-account profile row).
-- Kept here for repo record; the live source of truth is Supabase's migration history.

-- Persistent ledger of which emails have ever claimed a trial.
create table if not exists public.trial_claims (
  email      text primary key,
  user_id    uuid,
  claimed_at timestamptz not null default now()
);

-- Lock the table to SECURITY DEFINER functions / service role only (no client access).
alter table public.trial_claims enable row level security;

-- Backfill: anyone currently on a trial has already used theirs.
insert into public.trial_claims (email, user_id)
select lower(u.email), p.id
from public.profiles p
join auth.users u on u.id = p.id
where p.plan = 'trial'
on conflict (email) do nothing;

-- set_plan is the only writer to profiles; enforce the limit there.
create or replace function public.set_plan(p_user uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cap    numeric;
  v_period interval;
  v_email  text;
begin
  case p_plan
    when 'trial'    then v_cap := 50;   v_period := interval '7 days';
    when 'standard' then v_cap := 300;  v_period := interval '30 days';
    when 'pro'      then v_cap := 1500; v_period := interval '30 days';
    else                 v_cap := 0;    v_period := interval '30 days';
  end case;

  -- P1-7: one free trial per email. Paid plans (standard/pro) are never affected.
  if p_plan = 'trial' then
    select lower(email) into v_email from auth.users where id = p_user;
    if v_email is null then
      raise exception 'set_plan: user % not found', p_user using errcode = 'no_data_found';
    end if;
    if exists (select 1 from public.trial_claims where email = v_email) then
      raise exception 'trial_already_used: % has already claimed a free trial', v_email
        using errcode = 'unique_violation';
    end if;
    insert into public.trial_claims (email, user_id) values (v_email, p_user)
      on conflict (email) do nothing;
  end if;

  update public.profiles
     set plan              = p_plan,
         allowance_cap_zar = v_cap,
         used_zar          = 0,
         period_start      = now(),
         period_end        = now() + v_period
   where id = p_user;
end;
$function$;
