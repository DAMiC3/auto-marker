-- NOTE: this trigger + function were later DROPPED as a duplicate of
-- log_revenue_event() — see migration 20260615110323_drop_duplicate_revenue_trigger.
-- Kept here for an accurate, replayable history.

-- Trigger function: auto-inserts into revenue_events whenever a paid plan
-- is activated or renewed via set_plan().
-- Fires on: new subscription, upgrade, or renewal (period_start changes on same plan).
CREATE OR REPLACE FUNCTION public.log_plan_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email text;
  v_amount numeric;
  v_event_type text;
BEGIN
  -- Only care about paid plans
  IF NEW.plan NOT IN ('standard', 'pro') THEN
    RETURN NEW;
  END IF;

  -- Only fire when plan changed OR period_start advanced (= renewal on same plan)
  IF NOT (OLD.plan IS DISTINCT FROM NEW.plan
          OR OLD.period_start IS DISTINCT FROM NEW.period_start) THEN
    RETURN NEW;
  END IF;

  -- Get email from auth
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.id;

  v_amount := CASE NEW.plan WHEN 'pro' THEN 3000 ELSE 1000 END;

  v_event_type := CASE
    WHEN OLD.plan NOT IN ('standard', 'pro') THEN 'new_subscription'
    WHEN OLD.plan = NEW.plan                 THEN 'renewal'
    ELSE                                          'upgrade'
  END;

  INSERT INTO public.revenue_events
    (user_id, email, plan, previous_plan, amount_zar, event_type, created_at)
  VALUES
    (NEW.id, v_email, NEW.plan, OLD.plan, v_amount, v_event_type, now());

  RETURN NEW;
END;
$$;

-- Drop and recreate so re-running the migration is idempotent
DROP TRIGGER IF EXISTS trg_log_plan_revenue ON public.profiles;

CREATE TRIGGER trg_log_plan_revenue
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_plan_revenue();
