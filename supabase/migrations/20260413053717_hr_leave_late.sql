-- Montblanc Dialer — İzin talepleri & geç kalma (canlı projeye MCP ile uygulandı: montblanc-dialer)
-- Yerel/CI: supabase db push veya bu dosyayı referans alın.

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  days_used numeric(8,2) not null default 1,
  kind text not null default 'annual',
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_comment text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint leave_requests_dates check (date_to >= date_from)
);

create index if not exists leave_requests_firm_idx on public.leave_requests(firm_id);
create index if not exists leave_requests_user_idx on public.leave_requests(user_id);
create index if not exists leave_requests_status_idx on public.leave_requests(status);

create table if not exists public.late_arrivals (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  day_date date not null,
  minutes_late int not null default 0 check (minutes_late >= 0),
  note text,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists late_arrivals_firm_idx on public.late_arrivals(firm_id);
create index if not exists late_arrivals_user_day on public.late_arrivals(user_id, day_date);

create table if not exists public.user_leave_entitlements (
  user_id uuid not null references public.users(id) on delete cascade,
  year int not null,
  extra_days_granted numeric(8,2) not null default 0,
  primary key (user_id, year)
);

alter table public.leave_requests enable row level security;
alter table public.late_arrivals enable row level security;
alter table public.user_leave_entitlements enable row level security;

drop policy if exists leave_requests_service_all on public.leave_requests;
create policy leave_requests_service_all on public.leave_requests
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists late_arrivals_service_all on public.late_arrivals;
create policy late_arrivals_service_all on public.late_arrivals
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists user_leave_entitlements_service_all on public.user_leave_entitlements;
create policy user_leave_entitlements_service_all on public.user_leave_entitlements
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
