-- Allow 'trial' as a fourth plan tier alongside none/standard/pro.
alter table public.profiles drop constraint profiles_plan_check;
alter table public.profiles add constraint profiles_plan_check
  check (plan = any (array['none'::text, 'trial'::text, 'standard'::text, 'pro'::text]));

-- Extend set_plan: 'trial' grants R50 over a 3-day window.
-- Standard / Pro / none keep their existing behaviour.
create or replace function public.set_plan(p_user uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cap numeric;
  v_period interval;
begin
  case p_plan
    when 'trial'    then v_cap := 50;   v_period := interval '3 days';
    when 'standard' then v_cap := 300;  v_period := interval '30 days';
    when 'pro'      then v_cap := 1500; v_period := interval '30 days';
    else                 v_cap := 0;    v_period := interval '30 days';
  end case;

  update public.profiles
     set plan = p_plan,
         allowance_cap_zar = v_cap,
         used_zar = 0,
         period_start = now(),
         period_end = now() + v_period
   where id = p_user;
end;
$function$;
