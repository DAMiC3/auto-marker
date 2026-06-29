-- AutoMark: accounts + usage metering schema

-- Profiles: one row per auth user, holds plan + allowance for metering
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  subject text not null default '',
  plan text not null default 'none' check (plan in ('none','standard','pro')),
  allowance_cap_zar numeric(10,2) not null default 0,
  used_zar numeric(10,4) not null default 0,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read only their own profile
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Usage events: audit log of each marking run
create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  papers int not null default 1,
  model_tier text not null default 'standard',
  cost_zar numeric(10,4) not null default 0,
  file_name text,
  created_at timestamptz not null default now()
);

alter table public.usage_events enable row level security;

-- Users can read only their own usage
create policy "usage_select_own" on public.usage_events
  for select using (auth.uid() = user_id);

create index usage_events_user_idx on public.usage_events(user_id, created_at desc);

-- Auto-create a profile when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomically record a marking run: log event + add cost to used_zar
create or replace function public.add_usage(p_user uuid, p_cost numeric, p_papers int, p_tier text, p_file text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.usage_events (user_id, papers, model_tier, cost_zar, file_name)
  values (p_user, p_papers, p_tier, p_cost, p_file);
  update public.profiles set used_zar = used_zar + p_cost where id = p_user;
end;
$$;

-- Assign / renew a plan: set cap, reset usage, start a 30-day period
create or replace function public.set_plan(p_user uuid, p_plan text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare v_cap numeric;
begin
  v_cap := case p_plan when 'standard' then 300 when 'pro' then 1500 else 0 end;
  update public.profiles
     set plan = p_plan,
         allowance_cap_zar = v_cap,
         used_zar = 0,
         period_start = now(),
         period_end = now() + interval '30 days'
   where id = p_user;
end;
$$;

-- Lock down the sensitive functions: only the service role (server) may call them.
-- This prevents a logged-in user from granting themselves a plan or zeroing usage.
revoke all on function public.add_usage(uuid, numeric, int, text, text) from public, anon, authenticated;
revoke all on function public.set_plan(uuid, text) from public, anon, authenticated;
grant execute on function public.add_usage(uuid, numeric, int, text, text) to service_role;
grant execute on function public.set_plan(uuid, text) to service_role;
