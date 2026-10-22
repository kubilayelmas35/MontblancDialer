-- GeoCon: analiz skoru tek yerde. Kullanıldı / tavsiye edildi firma bazında.

create table if not exists public.geocon_plz_analysis (
  plz text primary key check (plz ~ '^[0-9]{5}$'),
  score numeric(3,1) not null check (score >= 0 and score <= 10),
  updated_at timestamptz not null default now()
);

create table if not exists public.geocon_plz_flags (
  firm_id uuid not null references public.firms(id) on delete cascade,
  plz text not null check (plz ~ '^[0-9]{5}$'),
  used boolean not null default false,
  recommended boolean not null default false,
  used_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (firm_id, plz)
);

create index if not exists geocon_plz_flags_firm_idx on public.geocon_plz_flags (firm_id);

alter table public.geocon_plz_analysis enable row level security;
alter table public.geocon_plz_flags enable row level security;

create or replace function mb_private.actor_can_geocon()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select mb_private.actor_role() in ('super_admin', 'admin', 'firm_admin')
$$;

revoke all on function mb_private.actor_can_geocon() from public;
grant execute on function mb_private.actor_can_geocon() to anon, authenticated, service_role;

drop policy if exists geocon_plz_analysis_select on public.geocon_plz_analysis;
create policy geocon_plz_analysis_select on public.geocon_plz_analysis
  for select using (mb_private.actor_can_geocon());

drop policy if exists geocon_plz_analysis_insert on public.geocon_plz_analysis;
create policy geocon_plz_analysis_insert on public.geocon_plz_analysis
  for insert with check (mb_private.actor_can_geocon());

drop policy if exists geocon_plz_analysis_update on public.geocon_plz_analysis;
create policy geocon_plz_analysis_update on public.geocon_plz_analysis
  for update using (mb_private.actor_can_geocon())
  with check (mb_private.actor_can_geocon());

drop policy if exists geocon_plz_flags_select on public.geocon_plz_flags;
create policy geocon_plz_flags_select on public.geocon_plz_flags
  for select using (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists geocon_plz_flags_insert on public.geocon_plz_flags;
create policy geocon_plz_flags_insert on public.geocon_plz_flags
  for insert with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists geocon_plz_flags_update on public.geocon_plz_flags;
create policy geocon_plz_flags_update on public.geocon_plz_flags
  for update using (mb_private.actor_is_firm_admin(firm_id))
  with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists geocon_plz_flags_delete on public.geocon_plz_flags;
create policy geocon_plz_flags_delete on public.geocon_plz_flags
  for delete using (mb_private.actor_is_firm_admin(firm_id));

grant select, insert, update on public.geocon_plz_analysis to anon, authenticated, service_role;
grant select, insert, update, delete on public.geocon_plz_flags to anon, authenticated, service_role;
