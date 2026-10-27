alter table public.users
  add column if not exists payroll_category_months jsonb not null default '{}'::jsonb;
