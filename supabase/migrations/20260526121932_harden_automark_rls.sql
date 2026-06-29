-- Hide tables from anonymous (pre-login) discovery; RLS still governs rows for authenticated
revoke select on public.profiles from anon;
revoke select on public.usage_events from anon;

-- handle_new_user is a trigger function only — it must not be callable via the REST RPC API
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Scope the read policies to signed-in users explicitly
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "usage_select_own" on public.usage_events;
create policy "usage_select_own" on public.usage_events
  for select to authenticated using (auth.uid() = user_id);
