alter table public.users
  add column if not exists payroll_category_id text;

alter table public.payroll_monthly
  add column if not exists office_days numeric(8,2) not null default 0;

create table if not exists public.payroll_ledger (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  kind text not null check (kind in ('gider', 'alacak', 'borc')),
  title text not null,
  amount numeric(14,2) not null default 0,
  currency text not null default 'EUR',
  period_ym text not null,
  recur boolean not null default false,
  paid boolean not null default false,
  paid_amount numeric(14,2) not null default 0,
  stopaj boolean not null default false,
  due_date date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists payroll_ledger_firm_idx on public.payroll_ledger(firm_id, period_ym);

alter table public.payroll_ledger enable row level security;

drop policy if exists payroll_ledger_service_all on public.payroll_ledger;
create policy payroll_ledger_service_all on public.payroll_ledger
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists payroll_ledger_actor_select on public.payroll_ledger;
create policy payroll_ledger_actor_select on public.payroll_ledger
  for select using (mb_private.actor_same_firm(firm_id));

drop policy if exists payroll_ledger_actor_write on public.payroll_ledger;
create policy payroll_ledger_actor_write on public.payroll_ledger
  for all using (mb_private.actor_is_firm_admin(firm_id))
  with check (mb_private.actor_is_firm_admin(firm_id));

grant select, insert, update, delete on public.payroll_ledger to anon, authenticated, service_role;
