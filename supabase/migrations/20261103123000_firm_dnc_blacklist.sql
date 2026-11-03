-- Firma geneli kara liste (DNC). Aramada ve yüklemede kullanılır.

create table if not exists public.firm_dnc (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  phone text not null,
  note text not null default '',
  source text not null default 'manual',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint firm_dnc_phone_chk check (char_length(phone) between 8 and 24),
  constraint firm_dnc_source_chk check (source in ('manual','import','outcome','gdpr')),
  constraint firm_dnc_firm_phone_uq unique (firm_id, phone)
);

create index if not exists firm_dnc_firm_created_idx on public.firm_dnc (firm_id, created_at desc);
create index if not exists firm_dnc_firm_phone_idx on public.firm_dnc (firm_id, phone);

alter table public.firm_dnc enable row level security;

drop policy if exists firm_dnc_select on public.firm_dnc;
create policy firm_dnc_select on public.firm_dnc
  for select using (mb_private.actor_same_firm(firm_id));

drop policy if exists firm_dnc_insert on public.firm_dnc;
create policy firm_dnc_insert on public.firm_dnc
  for insert with check (mb_private.actor_same_firm(firm_id));

drop policy if exists firm_dnc_update on public.firm_dnc;
create policy firm_dnc_update on public.firm_dnc
  for update using (mb_private.actor_is_firm_admin(firm_id))
  with check (mb_private.actor_is_firm_admin(firm_id));

drop policy if exists firm_dnc_delete on public.firm_dnc;
create policy firm_dnc_delete on public.firm_dnc
  for delete using (mb_private.actor_is_firm_admin(firm_id));

grant select, insert, update, delete on public.firm_dnc to anon, authenticated, service_role;
