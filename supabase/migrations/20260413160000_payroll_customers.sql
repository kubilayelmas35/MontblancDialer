-- Montblanc Dialer — Muhasebe + müşteri atama çekirdeği
-- Not: Uygulama service_role ile REST kullandığı için service_role policy yeterlidir.

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customers_firm_idx on public.customers(firm_id);
create index if not exists customers_name_idx on public.customers(name);

create table if not exists public.payroll_rules (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null unique references public.firms(id) on delete cascade,
  currency text not null default 'EUR',
  base_salary_mode text not null default 'net' check (base_salary_mode in ('net','gross_minimum')),
  base_salary_amount numeric(12,2) not null default 0,
  tax_rate_percent numeric(8,2) not null default 0,
  government_supported boolean not null default false,
  exchange_rate numeric(12,4) not null default 1,
  late_penalty_enabled boolean not null default false,
  late_penalty_amount numeric(12,2) not null default 0,
  leave_overflow_penalty_enabled boolean not null default false,
  leave_overflow_penalty_amount numeric(12,2) not null default 0,
  appointment_customer_select_by_agent boolean not null default false,
  bonus_tiers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_employee_overrides (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  no_termin boolean not null default false,
  base_salary_mode text check (base_salary_mode in ('net','gross_minimum')),
  base_salary_amount numeric(12,2),
  tax_rate_percent numeric(8,2),
  bonus_tiers jsonb,
  is_active boolean not null default true,
  notes text,
  unique (firm_id, user_id)
);

create index if not exists payroll_employee_overrides_firm_idx on public.payroll_employee_overrides(firm_id);
create index if not exists payroll_employee_overrides_user_idx on public.payroll_employee_overrides(user_id);

create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  period_ym text not null,
  adjustment_type text not null check (adjustment_type in ('add','deduct')),
  amount numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payroll_adjustments_firm_idx on public.payroll_adjustments(firm_id);
create index if not exists payroll_adjustments_user_period_idx on public.payroll_adjustments(user_id, period_ym);

create table if not exists public.payroll_monthly (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  period_ym text not null,
  currency text not null default 'EUR',
  base_salary numeric(12,2) not null default 0,
  bonus_amount numeric(12,2) not null default 0,
  leave_penalty numeric(12,2) not null default 0,
  late_penalty numeric(12,2) not null default 0,
  manual_additions numeric(12,2) not null default 0,
  manual_deductions numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  net_payable numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, user_id, period_ym)
);

create index if not exists payroll_monthly_firm_period_idx on public.payroll_monthly(firm_id, period_ym);

alter table public.appointments
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists appointments_customer_id_idx on public.appointments(customer_id);

alter table public.customers enable row level security;
alter table public.payroll_rules enable row level security;
alter table public.payroll_employee_overrides enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.payroll_monthly enable row level security;

drop policy if exists customers_service_all on public.customers;
create policy customers_service_all on public.customers
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists payroll_rules_service_all on public.payroll_rules;
create policy payroll_rules_service_all on public.payroll_rules
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists payroll_employee_overrides_service_all on public.payroll_employee_overrides;
create policy payroll_employee_overrides_service_all on public.payroll_employee_overrides
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists payroll_adjustments_service_all on public.payroll_adjustments;
create policy payroll_adjustments_service_all on public.payroll_adjustments
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists payroll_monthly_service_all on public.payroll_monthly;
create policy payroll_monthly_service_all on public.payroll_monthly
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
