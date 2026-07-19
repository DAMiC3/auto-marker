-- Terms & Conditions acceptance tracking.
-- Applied to Supabase project pdlkkfedovssaaecemkp (migration terms_acceptance_tracking).
--
-- A user "needs to accept" when profiles.terms_version <> CURRENT_TERMS_VERSION
-- (in lib/terms.ts). Bumping that constant re-prompts everyone on their next visit.

alter table public.profiles
  add column if not exists terms_version    text,
  add column if not exists terms_accepted_at timestamptz;

-- Record acceptance atomically for NEW signups: the signup form passes terms_version
-- in the auth user metadata, so a user who ticked the box at signup is marked accepted
-- the moment their profile row is created and never sees the acceptance pop-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, full_name, terms_version, terms_accepted_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'terms_version',
    case when new.raw_user_meta_data->>'terms_version' is not null then now() else null end
  );
  return new;
end;
$function$;
