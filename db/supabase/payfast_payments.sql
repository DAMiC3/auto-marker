-- PayFast payment ledger — idempotency + reconciliation for the paygate.
-- Applied to Supabase project pdlkkfedovssaaecemkp (migration payfast_payments_by_charge_id).
--
-- Keyed on PayFast's per-charge pf_payment_id (NOT our m_payment_id): a recurring
-- subscription reuses ONE m_payment_id across every monthly charge but mints a NEW
-- pf_payment_id each time, so pf_payment_id is the correct idempotency key — a
-- replayed ITN is a duplicate (unique-violation → no-op), a genuine renewal is not.
--
-- Service-role only: RLS is ON with no policies, so only the service key (which
-- bypasses RLS) reads/writes it, exactly like the metering tables. The webhook
-- (/api/webhooks/payfast) inserts one row per verified COMPLETE charge, then calls
-- set_plan(); the revenue_events trigger auto-logs the R1000/R3000.

create table if not exists public.payfast_payments (
  pf_payment_id text primary key,                       -- PayFast charge id — idempotency key
  m_payment_id  text,                                   -- our subscription reference (repeats across renewals)
  user_id       uuid not null references auth.users(id) on delete cascade,
  plan          text not null check (plan in ('standard','pro')),
  amount_zar    numeric not null,
  event_type    text not null default 'payment',
  raw           jsonb,                                  -- ITN payload, for audit/reconciliation
  created_at    timestamptz not null default now()
);

alter table public.payfast_payments enable row level security;

create index if not exists payfast_payments_user_idx on public.payfast_payments (user_id);
create index if not exists payfast_payments_mpay_idx on public.payfast_payments (m_payment_id);
