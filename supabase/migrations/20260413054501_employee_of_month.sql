-- Ayın elemanı (firma bazlı, ay başına bir kayıt)

create table if not exists public.employee_of_month (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  year int not null check (year >= 2020 and year <= 2100),
  month int not null check (month >= 1 and month <= 12),
  user_id uuid not null references public.users(id) on delete cascade,
  note text,
  set_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (firm_id, year, month)
);

create index if not exists employee_of_month_firm_idx on public.employee_of_month(firm_id);
create index if not exists employee_of_month_user_idx on public.employee_of_month(user_id);

alter table public.employee_of_month enable row level security;

drop policy if exists employee_of_month_service_all on public.employee_of_month;
create policy employee_of_month_service_all on public.employee_of_month
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
