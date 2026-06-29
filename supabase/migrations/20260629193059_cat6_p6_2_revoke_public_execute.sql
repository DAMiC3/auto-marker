-- P6-2 (corrective): the prior REVOKE FROM anon, authenticated left the default
-- EXECUTE grant to PUBLIC in place; anon/authenticated inherit EXECUTE via PUBLIC,
-- so the trigger fn was still callable via /rest/v1/rpc. Revoke from PUBLIC too.
-- The trigger still fires (owner context, SECURITY DEFINER); only direct RPC is blocked.
revoke execute on function public.log_revenue_event() from public, anon, authenticated;
