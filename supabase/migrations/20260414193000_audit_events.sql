create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid null references public.firms(id) on delete set null,
  actor_id uuid null references public.users(id) on delete set null,
  actor_role text null,
  event_type text not null,
  entity_type text null,
  entity_id text null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_events_firm_created_at on public.audit_events (firm_id, created_at desc);
create index if not exists idx_audit_events_actor_created_at on public.audit_events (actor_id, created_at desc);
create index if not exists idx_audit_events_event_type on public.audit_events (event_type);

alter table public.audit_events enable row level security;

drop policy if exists audit_events_select_policy on public.audit_events;
create policy audit_events_select_policy on public.audit_events
for select using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (
        u.role = 'super_admin'
        or (u.role in ('admin', 'firm_admin') and u.firm_id = audit_events.firm_id)
      )
  )
);

drop policy if exists audit_events_insert_policy on public.audit_events;
create policy audit_events_insert_policy on public.audit_events
for insert with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (
        u.role = 'super_admin'
        or (u.role in ('admin', 'firm_admin') and u.firm_id = audit_events.firm_id)
      )
  )
);
