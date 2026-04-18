alter table public.payroll_rules
  add column if not exists revenue_per_success numeric(12,2) not null default 0;
