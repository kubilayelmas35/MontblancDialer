alter table public.payroll_rules
  add column if not exists salary_tiers jsonb not null default '[]'::jsonb;

create table if not exists public.payroll_fx_rates (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  period_ym text not null,
  rate_date date not null,
  base_currency text not null default 'EUR',
  quote_currency text not null default 'TRY',
  rate numeric(16,6) not null,
  source text,
  created_at timestamptz not null default now(),
  unique (firm_id, rate_date, base_currency, quote_currency)
);

create index if not exists payroll_fx_rates_firm_period_idx on public.payroll_fx_rates(firm_id, period_ym);

alter table public.payroll_fx_rates enable row level security;

drop policy if exists payroll_fx_rates_service_all on public.payroll_fx_rates;
create policy payroll_fx_rates_service_all on public.payroll_fx_rates
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
