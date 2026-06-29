-- ── 1. Price map: what a customer PAYS for each plan (not the API cost cap) ──
-- standard = R1000/mo, pro = R3000/mo, trial/none = free (no revenue).
create or replace function public.plan_price(p_plan text)
returns numeric
language sql
immutable
as $function$
  select case p_plan
           when 'standard' then 1000
           when 'pro'      then 3000
           else 0
         end;
$function$;

-- ── 2. Revenue log: one row per real payment (purchase / upgrade / renewal) ──
create table if not exists public.revenue_events (
  id            bigint generated always as identity primary key,
  user_id       uuid references auth.users(id) on delete set null,
  email         text,                       -- snapshot, survives user deletion
  plan          text not null,              -- plan paid for
  previous_plan text,                        -- what they came from (audit)
  amount_zar    numeric not null default 0,  -- the price they paid
  event_type    text not null,              -- 'new' | 'change' | 'renewal'
  created_at    timestamptz not null default now()
);

-- Admin-only data: lock it down. Service role / SQL editor still bypasses RLS.
alter table public.revenue_events enable row level security;
revoke all on public.revenue_events from anon, authenticated;

-- ── 3. The trigger function — source-agnostic so it catches BOTH a manual ──
-- set_plan() call AND an automatic payment-gateway update to the same row.
create or replace function public.log_revenue_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text;
  v_prev  text;
  v_type  text;
begin
  -- Only paid plans earn revenue. Going to 'none' or 'trial' logs nothing.
  if NEW.plan not in ('standard', 'pro') then
    return NEW;
  end if;

  v_prev := case when TG_OP = 'UPDATE' then OLD.plan else null end;

  -- Don't count the owner's own test transactions.
  select email into v_email from auth.users where id = NEW.id;
  if v_email = 'bernardmanne3@gmail.com' then
    return NEW;
  end if;

  -- Classify the event:
  --   new      = first paid plan after none/trial (or a fresh insert)
  --   renewal  = same plan, new billing period (automatic or manual)
  --   change   = upgrade / downgrade between paid plans
  v_type := case
              when TG_OP = 'INSERT'           then 'new'
              when v_prev in ('none', 'trial') then 'new'
              when v_prev = NEW.plan          then 'renewal'
              else 'change'
            end;

  insert into public.revenue_events
    (user_id, email, plan, previous_plan, amount_zar, event_type)
  values
    (NEW.id, v_email, NEW.plan, v_prev, public.plan_price(NEW.plan), v_type);

  return NEW;
end;
$function$;

-- ── 4. Wire the triggers ──
-- UPDATE: fire only when the plan changed OR a new billing period started
-- (a renewal keeps the same plan but resets period_start). This deliberately
-- ignores used_zar increments from marking, so they never look like revenue.
drop trigger if exists trg_log_revenue_update on public.profiles;
create trigger trg_log_revenue_update
  after update on public.profiles
  for each row
  when (old.plan is distinct from new.plan
        or old.period_start is distinct from new.period_start)
  execute function public.log_revenue_event();

-- INSERT: only if a profile is somehow created already on a paid plan
-- (e.g. a pay gate provisioning directly). Normal signups start at 'none'.
drop trigger if exists trg_log_revenue_insert on public.profiles;
create trigger trg_log_revenue_insert
  after insert on public.profiles
  for each row
  when (new.plan in ('standard', 'pro'))
  execute function public.log_revenue_event();

-- ── 5. Reporting views (owner already excluded at log time) ──
create or replace view public.revenue_total as
select
  coalesce(sum(amount_zar), 0)  as total_zar,
  count(*)                      as payments,
  count(distinct user_id)       as paying_customers
from public.revenue_events;

create or replace view public.revenue_by_user as
select
  email,
  count(*)                      as payments,
  coalesce(sum(amount_zar), 0)  as total_zar,
  min(created_at)               as first_payment,
  max(created_at)               as last_payment,
  max(plan)                     as latest_plan
from public.revenue_events
group by email
order by total_zar desc;

-- Views bypass RLS, so lock them to admin (service role / SQL editor) too.
revoke all on public.revenue_total   from anon, authenticated;
revoke all on public.revenue_by_user from anon, authenticated;
